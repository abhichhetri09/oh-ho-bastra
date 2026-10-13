package admin

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

// DeleteCategory deletes a category; its subcategories and products keep
// existing with a NULL parent/category (ON DELETE SET NULL).
func DeleteCategory(queries repository.CategoryRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		categoryID, ok := httpx.PathUUID(c, "id", constants.InvalidCategoryID, "category ID")
		if !ok {
			return
		}

		result, err := queries.DeleteCategory(c.Request.Context(), categoryID)
		if err != nil {
			httpx.Internal(c, "failed to delete category", err, "category_id", categoryID)
			return
		}

		if result.RowsAffected() == 0 {
			httpx.Fail(c, http.StatusNotFound, constants.CategoryNotFound, "Category not found")
			return
		}

		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Category deleted",
		})
	}
}
