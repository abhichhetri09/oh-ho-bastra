package admin

import (
	"net/http"

	"github.com/gin-gonic/gin"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

const pageLimit int64 = 20

func GetPaginatedCategories(queries repository.CategoryRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		page, ok := httpx.ParsePage(c)
		if !ok {
			return
		}

		total, err := queries.GetCategoriesCount(ctx)
		if err != nil {
			httpx.Internal(c, "failed to count categories", err)
			return
		}

		if !httpx.CheckPageInRange(c, page, total, pageLimit) {
			return
		}

		categories := []db.Category{}
		if total > 0 {
			categories, err = queries.GetPaginatedCategories(ctx, db.GetPaginatedCategoriesParams{
				Limit:  int32(pageLimit),
				Offset: httpx.Offset(page, pageLimit),
			})
			if err != nil {
				httpx.Internal(c, "failed to list categories", err)
				return
			}
		}

		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Categories fetched",
			Data:    categories,
			Meta:    types.NewPaginationMeta(total, page, pageLimit),
		})
	}
}
