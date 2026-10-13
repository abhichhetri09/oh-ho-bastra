package admin

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

const reviewsPageSize int64 = 20

// ListReviews is every review, newest first, for moderation: status is
// published or hidden, rating 1 to 5.
func ListReviews(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		page, ok := httpx.ParsePage(c)
		if !ok {
			return
		}

		var status pgtype.Text
		switch s := c.Query("status"); s {
		case "":
		case "published", "hidden":
			status = pgtype.Text{String: s, Valid: true}
		default:
			httpx.Fail(c, http.StatusBadRequest, constants.InvalidQueryParam, "status must be published or hidden")
			return
		}
		var rating pgtype.Int4
		if r := c.Query("rating"); r != "" {
			n, err := strconv.Atoi(r)
			if err != nil || n < 1 || n > 5 {
				httpx.Fail(c, http.StatusBadRequest, constants.InvalidQueryParam, "rating must be 1 to 5")
				return
			}
			rating = pgtype.Int4{Int32: int32(n), Valid: true}
		}

		total, err := queries.CountAdminReviews(ctx, db.CountAdminReviewsParams{Status: status, Rating: rating})
		if err != nil {
			httpx.Internal(c, "failed to count reviews", err)
			return
		}
		if !httpx.CheckPageInRange(c, page, total, reviewsPageSize) {
			return
		}
		reviews := []db.AdminListReviewsRow{}
		if total > 0 {
			reviews, err = queries.AdminListReviews(ctx, db.AdminListReviewsParams{
				Status: status, Rating: rating,
				PageLimit: int32(reviewsPageSize), PageOffset: httpx.Offset(page, reviewsPageSize),
			})
			if err != nil {
				httpx.Internal(c, "failed to list reviews", err)
				return
			}
		}
		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Reviews fetched",
			Data:    reviews,
			Meta:    types.NewPaginationMeta(total, page, reviewsPageSize),
		})
	}
}

// SetReviewStatus publishes or hides a review; the product's rating
// follows (a trigger counts published reviews only).
func SetReviewStatus(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := httpx.PathUUID(c, "id", constants.InvalidReviewID, "review ID")
		if !ok {
			return
		}
		req, ok := validator.BindJSON[types.ReviewStatus](c)
		if !ok {
			return
		}
		review, err := queries.SetReviewStatus(c.Request.Context(), db.SetReviewStatusParams{ID: id, Status: req.Status})
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(c, http.StatusNotFound, constants.ReviewNotFound, "Review not found")
			return
		}
		if err != nil {
			httpx.Internal(c, "failed to update review", err)
			return
		}
		message := "Review published"
		if req.Status == "hidden" {
			message = "Review hidden"
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: message, Data: review})
	}
}
