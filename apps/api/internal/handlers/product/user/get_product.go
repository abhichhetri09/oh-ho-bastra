package user

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/rlog"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"golang.org/x/sync/errgroup"
)

// GetProduct returns a visible product's detail page: the product with its
// default variant, its active variants and up to 8 related products.
func GetProduct(queries repository.ProductRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		productSlug := c.Param("productSlug")

		g, ctx := errgroup.WithContext(ctx)

		var productDetail db.GetProductWithDefaultVariantBySlugRow
		var variants []db.GetVariantsByProductSlugRow
		var related []db.StorefrontProduct

		// each goroutine owns its err; errgroup returns the first failure
		g.Go(func() error {
			var err error
			productDetail, err = queries.GetProductWithDefaultVariantBySlug(ctx, productSlug)
			return err
		})

		g.Go(func() error {
			var err error
			variants, err = queries.GetVariantsByProductSlug(ctx, productSlug)
			return err
		})

		g.Go(func() error {
			var err error
			related, err = queries.GetRelatedProducts(ctx, productSlug)
			return err
		})

		if err := g.Wait(); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				rlog.Warn(c, "product not found", "slug", productSlug)
				httpx.Fail(c, http.StatusNotFound, constants.ProductNotFound, "Product not found")
				return
			}
			httpx.Internal(c, "failed to fetch product", err, "slug", productSlug)
			return
		}

		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Product fetched",
			Data: types.GetProductDetailResponse{
				ProductDetail:   productDetail,
				Variants:        variants,
				RelatedProducts: related,
			},
		})
	}
}
