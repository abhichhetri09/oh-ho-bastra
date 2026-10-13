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

// UpdateProduct replaces every editable field of a product.
func UpdateProduct(queries repository.ProductRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		productID, ok := httpx.PathUUID(c, "productID", constants.InvalidProductID, "product ID")
		if !ok {
			return
		}

		body, ok := validator.BindJSON[types.UpdateProduct](c)
		if !ok {
			return
		}
		req := (*types.CreateProduct)(body)

		product, err := queries.GetProductByID(ctx, productID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				httpx.Fail(c, http.StatusNotFound, constants.ProductNotFound, "Product not found")
				return
			}
			httpx.Internal(c, "failed to fetch product", err, "product_id", productID)
			return
		}

		slug, ok := productSlug(c, queries, req.Name, product.Slug)
		if !ok {
			return
		}

		cols := toProductColumns(req)
		updated, err := queries.UpdateProduct(ctx, db.UpdateProductParams{
			ID:             productID,
			Name:           req.Name,
			Slug:           slug,
			CategoryID:     cols.categoryID,
			Description:    cols.description,
			Features:       cols.features,
			Images:         req.Images,
			ImagePublicIds: req.ImagePublicIDs,
			IsActive:       *req.IsActive,
			IsFeatured:     *req.IsFeatured,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				// deleted between the read and the update
				httpx.Fail(c, http.StatusNotFound, constants.ProductNotFound, "Product not found")
				return
			}
			writeProductError(c, err, "failed to update product")
			return
		}

		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Product updated",
			Data:    updated,
		})
	}
}
