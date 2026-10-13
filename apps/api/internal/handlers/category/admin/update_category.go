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

// cycleConstraint is raised by the categories_no_cycle trigger.
const cycleConstraint = "categories_no_cycle"

// UpdateCategory renames and places a category. Like every PUT it replaces
// the whole resource: an omitted parent_id makes it a root category.
func UpdateCategory(queries repository.CategoryRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		categoryID, ok := httpx.PathUUID(c, "id", constants.InvalidCategoryID, "category ID")
		if !ok {
			return
		}

		req, ok := validator.BindJSON[types.UpdateCategory](c)
		if !ok {
			return
		}

		category, err := queries.GetCategoryByID(ctx, categoryID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				httpx.Fail(c, http.StatusNotFound, constants.CategoryNotFound, "Category not found")
				return
			}
			httpx.Internal(c, "failed to fetch category", err, "category_id", categoryID)
			return
		}

		slug, ok := uniqueCategorySlug(c, queries, req.Name, category.Slug)
		if !ok {
			return
		}

		var parentID pgtype.UUID
		if req.ParentID != "" {
			// the binding's uuid rule already validated the format
			parentID, _ = utils.ConvertToUUID(req.ParentID)
		}

		// A root has no ancestors to check.
		if parentID.Valid && !sameUUID(parentID, category.ParentID) {
			if sameUUID(parentID, categoryID) {
				httpx.Fail(c, http.StatusBadRequest, constants.SelfReferencingCategory, "A category cannot be its own parent")
				return
			}

			// The new parent's ancestor chain (which includes the parent itself)
			// must not contain this category, or the tree would become a cycle.
			ancestors, err := queries.GetCategoryAncestors(ctx, parentID)
			if err != nil {
				httpx.Internal(c, "failed to fetch category ancestors", err, "parent_id", parentID)
				return
			}
			if len(ancestors) == 0 {
				rlog.Warn(c, "parent category not found", "parent_id", parentID)
				httpx.Fail(c, http.StatusNotFound, constants.CategoryNotFound, "Parent category not found")
				return
			}
			for _, a := range ancestors {
				if sameUUID(a.ID, categoryID) {
					httpx.Fail(c, http.StatusBadRequest, constants.CyclicCategoryReference,
						"Assigning this parent would create a circular reference")
					return
				}
			}
		}

		updated, err := queries.UpdateCategory(ctx, db.UpdateCategoryParams{
			Name:     req.Name,
			Slug:     slug,
			ID:       categoryID,
			ParentID: parentID,
		})
		if err != nil {
			var pgErr *pgconn.PgError
			switch {
			case errors.Is(err, pgx.ErrNoRows):
				// deleted between the read and the update
				httpx.Fail(c, http.StatusNotFound, constants.CategoryNotFound, "Category not found")
			case errors.As(err, &pgErr) && pgErr.Code == "23505":
				httpx.Fail(c, http.StatusConflict, constants.CategoryAlreadyExists, "Category already exists")
			case errors.As(err, &pgErr) && pgErr.ConstraintName == cycleConstraint:
				// a concurrent move made this one cyclic (see migration 000004)
				httpx.Fail(c, http.StatusBadRequest, constants.CyclicCategoryReference,
					"Assigning this parent would create a circular reference")
			case errors.As(err, &pgErr) && pgErr.Code == "23503":
				// parent deleted between the check and the update
				httpx.Fail(c, http.StatusNotFound, constants.CategoryNotFound, "Parent category not found")
			default:
				httpx.Internal(c, "failed to update category", err, "category_id", categoryID)
			}
			return
		}

		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Category updated",
			Data:    updated,
		})
	}
}
