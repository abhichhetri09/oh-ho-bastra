package admin

import (
	"errors"
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

func CreateProductVariant(queries repository.VariantRepository, pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		productID, ok := httpx.PathUUID(c, "productID", constants.InvalidProductID, "product ID")
		if !ok {
			return
		}

		req, ok := validator.BindJSON[types.CreateProductVariant](c)
		if !ok {
			return
		}

		props := make([]string, len(req.Properties))
		for i, prop := range req.Properties {
			props[i] = prop.Name + "=" + prop.Value
		}
		sort.Strings(props)
		combinationKey := strings.Join(props, "|")

		tx, err := pool.Begin(ctx)
		if err != nil {
			httpx.Internal(c, "failed to begin transaction", err)
			return
		}
		defer func() { _ = tx.Rollback(ctx) }()

		qtx := queries.WithTx(tx)

		product, err := qtx.GetProductByID(ctx, productID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				httpx.Fail(c, http.StatusNotFound, constants.ProductNotFound, "Product not found")
				return
			}
			httpx.Internal(c, "failed to fetch product", err, "product_id", productID)
			return
		}

		var variantOptions []string
		for _, prop := range req.Properties {
			variantOptions = append(variantOptions, prop.Value)
		}

		sku := utils.GenerateSKU(product.Name, variantOptions)

		// A new default takes over from the current one.
		if *req.IsDefault {
			if err := qtx.ClearOtherDefaults(ctx, db.ClearOtherDefaultsParams{ProductID: productID}); err != nil {
				httpx.Internal(c, "failed to clear the default variant", err, "product_id", productID)
				return
			}
		}

		// The SKU's random part makes a collision practically impossible; a
		// unique violation aborts the transaction, so it is not retried here.
		variant, err := qtx.CreateProductVariant(ctx, db.CreateProductVariantParams{
			ProductID:            productID,
			Sku:                  pgtype.Text{String: sku, Valid: true},
			Stock:                int32(*req.Stock),
			Images:               req.Images,
			ImagePublicIds:       req.ImagePublicIDs,
			SellingPrice:         int32(req.SellingPrice),
			OfferPrice:           toOfferPrice(req.OfferPrice),
			OfferExpiresAt:       toOfferExpiry(req.OfferPrice, req.OfferExpiresAt),
			OptionCombinationKey: combinationKey,
			IsDefault:            *req.IsDefault,
			IsActive:             *req.IsActive,
		})
		if err != nil {
			writeVariantError(c, err, "failed to create variant")
			return
		}

		// Upserts: options and values are shared by the product's variants.
		for _, prop := range req.Properties {
			option, err := qtx.UpsertProductOption(ctx, db.UpsertProductOptionParams{
				ProductID: product.ID,
				Name:      prop.Name,
				Type:      prop.Type,
			})
			if err != nil {
				httpx.Internal(c, "failed to save product option", err, "name", prop.Name)
				return
			}

			value, err := qtx.UpsertProductOptionValue(ctx, db.UpsertProductOptionValueParams{
				OptionID: option.ID,
				Value:    prop.Value,
			})
			if err != nil {
				httpx.Internal(c, "failed to save option value", err, "value", prop.Value)
				return
			}

			err = qtx.CreateVariantOptionValue(ctx, db.CreateVariantOptionValueParams{
				VariantID:     variant.ID,
				OptionValueID: value.ID,
			})
			if err != nil {
				httpx.Internal(c, "failed to create variant option value", err, "variantID", variant.ID, "optionValueID", value.ID)
				return
			}
		}

		if err := tx.Commit(ctx); err != nil {
			httpx.Internal(c, "transaction commit failed", err, "variantID", variant.ID)
			return
		}

		c.JSON(http.StatusCreated, types.APIResponse{
			Success: true,
			Message: "Variant created",
			Data:    variant,
		})
	}
}
