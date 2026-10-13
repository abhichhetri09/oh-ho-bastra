package admin

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

// UpdateProductVariant replaces a variant's images, prices and flags. Its
// SKU and option combination are fixed at creation, and its stock has its
// own endpoint. Making it the default takes that from the current default
// in the same transaction.
func UpdateProductVariant(queries repository.VariantRepository, pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		productID, variantID, ok := variantIDs(c)
		if !ok {
			return
		}

		req, ok := validator.BindJSON[types.UpdateProductVariant](c)
		if !ok {
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			httpx.Internal(c, "failed to begin transaction", err)
			return
		}
		defer func() { _ = tx.Rollback(ctx) }()
		qtx := queries.WithTx(tx)

		if *req.IsDefault {
			err := qtx.ClearOtherDefaults(ctx, db.ClearOtherDefaultsParams{ProductID: productID, KeepID: variantID})
			if err != nil {
				httpx.Internal(c, "failed to clear the default variant", err, "product_id", productID)
				return
			}
		}

		updated, err := qtx.UpdateVariant(ctx, db.UpdateVariantParams{
			ID:             variantID,
			ProductID:      productID,
			Images:         req.Images,
			ImagePublicIds: req.ImagePublicIDs,
			SellingPrice:   int32(req.SellingPrice),
			OfferPrice:     toOfferPrice(req.OfferPrice),
			OfferExpiresAt: toOfferExpiry(req.OfferPrice, req.OfferExpiresAt),
			IsDefault:      *req.IsDefault,
			IsActive:       *req.IsActive,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				httpx.Fail(c, http.StatusNotFound, constants.VariantNotFound, "Variant not found")
				return
			}
			writeVariantError(c, err, "failed to update variant")
			return
		}
		if err := tx.Commit(ctx); err != nil {
			httpx.Internal(c, "failed to commit variant update", err)
			return
		}

		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Variant updated",
			Data:    updated,
		})
	}
}
