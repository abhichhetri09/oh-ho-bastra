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
)

func GetByVariantID(queries repository.VariantRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID, variantID, ok := variantIDs(c)
		if !ok {
			return
		}

		variant, err := queries.GetProductVariant(c.Request.Context(), db.GetProductVariantParams{
			ID:        variantID,
			ProductID: productID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				httpx.Fail(c, http.StatusNotFound, constants.VariantNotFound, "Variant not found")
				return
			}
			httpx.Internal(c, "failed to fetch variant", err, "variant_id", variantID)
			return
		}

		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Variant fetched",
			Data:    variant,
		})
	}
}
