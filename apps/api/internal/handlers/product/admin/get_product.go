package admin

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

// GetProductByID returns one product (active or not) for the admin editor.
func GetProductByID(queries repository.ProductRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID, ok := httpx.PathUUID(c, "productID", constants.InvalidProductID, "product ID")
		if !ok {
			return
		}

		product, err := queries.GetProductByID(c.Request.Context(), productID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				httpx.Fail(c, http.StatusNotFound, constants.ProductNotFound, "Product not found")
				return
			}
			httpx.Internal(c, "failed to fetch product", err, "product_id", productID)
			return
		}

		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Product fetched",
			Data:    product,
		})
	}
}
