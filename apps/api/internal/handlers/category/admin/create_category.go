package admin

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/rlog"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

func CreateCategory(queries repository.CategoryRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		req, ok := validator.BindJSON[types.CreateCategory](c)
		if !ok {
			return
		}

		slug, ok := uniqueCategorySlug(c, queries, req.Name, "")
		if !ok {
			return
		}

		var (
			category db.Category
			err      error
			message  = "Category created"
		)

		if req.ParentID != "" {
			// the binding's uuid rule already validated the format
			parentID, _ := utils.ConvertToUUID(req.ParentID)

			if _, err := queries.GetCategoryByID(ctx, parentID); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					rlog.Warn(c, "parent category not found", "parent_id", parentID)
					httpx.Fail(c, http.StatusNotFound, constants.CategoryNotFound, "Parent category not found")
					return
				}
				httpx.Internal(c, "failed to fetch parent category", err, "parent_id", parentID)
				return
			}

			category, err = queries.CreateSubCategory(ctx, db.CreateSubCategoryParams{
				Name:     req.Name,
				ParentID: parentID,
				Slug:     slug,
			})
			message = "Subcategory created"
		} else {
			category, err = queries.CreateCategory(ctx, db.CreateCategoryParams{
				Name: req.Name,
				Slug: slug,
			})
		}

		if err != nil {
			var pgErr *pgconn.PgError
			switch {
			case errors.As(err, &pgErr) && pgErr.Code == "23505":
				httpx.Fail(c, http.StatusConflict, constants.CategoryAlreadyExists, "Category already exists")
			case errors.As(err, &pgErr) && pgErr.Code == "23503":
				// parent deleted between the check and the insert
				httpx.Fail(c, http.StatusNotFound, constants.CategoryNotFound, "Parent category not found")
			default:
				httpx.Internal(c, "failed to create category", err)
			}
			return
		}

		c.JSON(http.StatusCreated, types.APIResponse{
			Success: true,
			Message: message,
			Data:    category,
		})
	}
}

// uniqueCategorySlug slugifies name, adding a random suffix when another
// category has the slug. A category keeps its current slug when the name
// still slugifies to it. On failure it writes a 500 and returns false.
func uniqueCategorySlug(c *gin.Context, queries repository.CategoryRepository, name, current string) (string, bool) {
	slug := utils.Slugify(name)
	if current != "" && utils.SlugMatches(current, slug) {
		return current, true
	}

	exists, err := queries.CategorySlugExists(c.Request.Context(), slug)
	if err != nil {
		httpx.Internal(c, "failed to check category slug", err)
		return "", false
	}
	if !exists {
		return slug, true
	}

	slug, err = utils.SlugWithSuffix(slug)
	if err != nil {
		httpx.Internal(c, "failed to generate category slug", err)
		return "", false
	}
	return slug, true
}

// sameUUID reports whether two nullable UUIDs are equal (two NULLs are).
func sameUUID(a, b pgtype.UUID) bool {
	return a.Valid == b.Valid && (!a.Valid || a.Bytes == b.Bytes)
}
