package admin

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

func DeleteVariant(queries repository.VariantRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID, variantID, ok := variantIDs(c)
		if !ok {
			return
		}

		result, err := queries.DeleteVariant(c.Request.Context(), db.DeleteVariantParams{
			ID:        variantID,
			ProductID: productID,
		})
		if err != nil {
			httpx.Internal(c, "failed to delete variant", err, "variant_id", variantID)
			return
		}

		if result.RowsAffected() == 0 {
			httpx.Fail(c, http.StatusNotFound, constants.VariantNotFound, "Variant not found")
			return
		}

		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Variant deleted",
		})
	}
}
