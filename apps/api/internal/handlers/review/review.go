// Package review serves product reviews. Only verified buyers (a paid
// order holds the product) can write one, once per product.
package review

import (
	"errors"
	"math"
	"net/http"
	"strings"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

const pageSize = int64(10)

// productID resolves the slug of a product on sale, answering 404 itself.
func productID(c *gin.Context, queries *db.Queries) (pgtype.UUID, bool) {
	id, err := queries.GetStorefrontProductIDBySlug(c.Request.Context(), c.Param("productSlug"))
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, constants.ProductNotFound, "Product not found")
		return id, false
	}
	if err != nil {
		httpx.Internal(c, "failed to get product", err)
		return id, false
	}
	return id, true
}

// List is a product's published reviews, newest first, with a summary.
func List(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		page, ok := httpx.ParsePage(c)
		if !ok {
			return
		}
		id, ok := productID(c, queries)
		if !ok {
			return
		}
		ctx := c.Request.Context()

		dist, err := queries.ReviewDistribution(ctx, id)
		if err != nil {
			httpx.Internal(c, "failed to summarise reviews", err)
			return
		}
		summary := summarise(dist)
		if !httpx.CheckPageInRange(c, page, summary.Count, pageSize) {
			return
		}

		reviews := []types.PublicReview{}
		if summary.Count > 0 {
			rows, err := queries.ListPublishedReviews(ctx, db.ListPublishedReviewsParams{
				ProductID: id,
				Limit:     int32(pageSize),
				Offset:    httpx.Offset(page, pageSize),
			})
			if err != nil {
				httpx.Internal(c, "failed to list reviews", err)
				return
			}
			for _, r := range rows {
				reviews = append(reviews, types.PublicReview{
					ID: r.ID, Rating: r.Rating, Title: r.Title, Body: r.Body,
					Author: displayName(r.AuthorName), CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
				})
			}
		}

		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Reviews fetched",
			Data:    types.ReviewList{Summary: summary, Reviews: reviews},
			Meta:    types.NewPaginationMeta(summary.Count, page, pageSize),
		})
	}
}

// Mine is whether the user may review the product, and their review.
func Mine(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := httpx.UserID(c)
		if !ok {
			return
		}
		id, ok := productID(c, queries)
		if !ok {
			return
		}
		ctx := c.Request.Context()
		bought, err := queries.HasBoughtProduct(ctx, db.HasBoughtProductParams{UserID: userID, ProductID: id})
		if err != nil {
			httpx.Internal(c, "failed to check purchase", err)
			return
		}
		var mine *db.Review
		review, err := queries.GetMyReview(ctx, db.GetMyReviewParams{ProductID: id, UserID: userID})
		switch {
		case err == nil:
			mine = &review
		case !errors.Is(err, pgx.ErrNoRows):
			httpx.Internal(c, "failed to get review", err)
			return
		}
		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Review fetched",
			Data:    types.MyReview{CanReview: bought, Review: mine},
		})
	}
}

// Write creates or edits the user's review; they must have bought it.
func Write(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := httpx.UserID(c)
		if !ok {
			return
		}
		req, ok := validator.BindJSON[types.ReviewRequest](c)
		if !ok {
			return
		}
		id, ok := productID(c, queries)
		if !ok {
			return
		}
		ctx := c.Request.Context()
		bought, err := queries.HasBoughtProduct(ctx, db.HasBoughtProductParams{UserID: userID, ProductID: id})
		if err != nil {
			httpx.Internal(c, "failed to check purchase", err)
			return
		}
		if !bought {
			httpx.Fail(c, http.StatusForbidden, constants.NotVerifiedBuyer,
				"Only customers who bought this product can review it")
			return
		}
		review, err := queries.UpsertReview(ctx, db.UpsertReviewParams{
			ProductID: id,
			UserID:    userID,
			Rating:    int16(req.Rating),
			Title:     strings.TrimSpace(req.Title),
			Body:      strings.TrimSpace(req.Body),
		})
		if err != nil {
			httpx.Internal(c, "failed to save review", err)
			return
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Review saved", Data: review})
	}
}

// Delete removes the user's review.
func Delete(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := httpx.UserID(c)
		if !ok {
			return
		}
		id, ok := productID(c, queries)
		if !ok {
			return
		}
		n, err := queries.DeleteReview(c.Request.Context(), db.DeleteReviewParams{ProductID: id, UserID: userID})
		if err != nil {
			httpx.Internal(c, "failed to delete review", err)
			return
		}
		if n == 0 {
			httpx.Fail(c, http.StatusNotFound, constants.ReviewNotFound, "You haven't reviewed this product")
			return
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Review deleted"})
	}
}

// summarise turns per-star counts into an average (one decimal) and a
// fixed five-slot distribution.
func summarise(rows []db.ReviewDistributionRow) types.ReviewSummary {
	var s types.ReviewSummary
	var sum int64
	for _, r := range rows {
		if r.Rating < 1 || r.Rating > 5 {
			continue
		}
		s.Distribution[r.Rating-1] = r.Count
		s.Count += int64(r.Count)
		sum += int64(r.Count) * int64(r.Rating)
	}
	if s.Count > 0 {
		s.Average = math.Round(float64(sum)/float64(s.Count)*10) / 10
	}
	return s
}

// displayName shows a reviewer as their first name and last initial.
func displayName(full string) string {
	parts := strings.Fields(full)
	switch len(parts) {
	case 0:
		return "A customer"
	case 1:
		return parts[0]
	}
	last := []rune(parts[len(parts)-1])
	return parts[0] + " " + string(unicode.ToUpper(last[0])) + "."
}
