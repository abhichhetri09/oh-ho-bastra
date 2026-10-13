package user

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

// ListCategories returns every category with its depth, parents before
// children, so the storefront can build its navigation tree. Not paginated:
// the category tree is small and needed whole.
func ListCategories(queries repository.CategoryRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		categories, err := queries.GetCategoryTree(c.Request.Context())
		if err != nil {
			httpx.Internal(c, "failed to list categories", err)
			return
		}

		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Categories fetched",
			Data:    categories,
		})
	}
}
