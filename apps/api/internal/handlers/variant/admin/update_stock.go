package admin

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

// SetVariantStock sets a variant's stock to a counted value (not a delta,
// so retrying a request is harmless).
func SetVariantStock(queries repository.VariantRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID, ok := httpx.PathUUID(c, "productID", constants.InvalidProductID, "product ID")
		if !ok {
			return
		}
		variantID, ok := httpx.PathUUID(c, "variantID", constants.InvalidVariantID, "variant ID")
		if !ok {
			return
		}

		req, ok := validator.BindJSON[types.UpdateStock](c)
		if !ok {
			return
		}

		variant, err := queries.SetVariantStock(c.Request.Context(), db.SetVariantStockParams{
			ID:        variantID,
			ProductID: productID,
			Stock:     int32(*req.Stock),
		})
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(c, http.StatusNotFound, constants.VariantNotFound, "Variant not found")
			return
		}
		if err != nil {
			httpx.Internal(c, "failed to set stock", err, "variant_id", variantID)
			return
		}

		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Stock updated",
			Data:    variant,
		})
	}
}
