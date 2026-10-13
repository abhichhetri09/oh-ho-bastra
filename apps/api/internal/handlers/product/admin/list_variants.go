package admin

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

// ListVariants is every variant of a product, inactive ones included,
// default first, with its options. A product has a handful, so it isn't
// paginated.
func ListVariants(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID, ok := httpx.PathUUID(c, "productID", constants.InvalidProductID, "product ID")
		if !ok {
			return
		}
		ctx := c.Request.Context()
		if _, err := queries.GetProductByID(ctx, productID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				httpx.Fail(c, http.StatusNotFound, constants.ProductNotFound, "Product not found")
				return
			}
			httpx.Internal(c, "failed to get product", err)
			return
		}
		variants, err := queries.AdminListVariants(ctx, productID)
		if err != nil {
			httpx.Internal(c, "failed to list variants", err)
			return
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Variants fetched", Data: variants})
	}
}
