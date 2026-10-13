package admin

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/cloudinary"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

// DeleteProduct deletes a product; its variants, options and cart items go
// with it (ON DELETE CASCADE), and past orders keep their copy. Its images
// are then removed from Cloudinary in the background, except those that
// past orders still show.
func DeleteProduct(queries *db.Queries, cld *cloudinary.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID, ok := httpx.PathUUID(c, "productID", constants.InvalidProductID, "product ID")
		if !ok {
			return
		}
		ctx := c.Request.Context()

		images, err := queries.ListProductImages(ctx, productID)
		if err != nil {
			httpx.Internal(c, "failed to list product images", err, "product_id", productID)
			return
		}

		urls := make([]string, len(images))
		for i, img := range images {
			urls[i] = img.Url
		}
		ordered, err := queries.OrderedImages(ctx, urls)
		if err != nil {
			httpx.Internal(c, "failed to check ordered images", err, "product_id", productID)
			return
		}

		result, err := queries.DeleteProduct(ctx, productID)
		if err != nil {
			httpx.Internal(c, "failed to delete product", err, "product_id", productID)
			return
		}
		if result.RowsAffected() == 0 {
			httpx.Fail(c, http.StatusNotFound, constants.ProductNotFound, "Product not found")
			return
		}

		if ids := deletableImages(cld, images, ordered); len(ids) > 0 {
			go deleteImages(cld, ids)
		}

		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Product deleted",
		})
	}
}

// deletableImages picks the public ids safe to delete: our own uploads
// (see Client.Owns), once each, and none that a past order shows.
func deletableImages(cld *cloudinary.Client, images []db.ListProductImagesRow, ordered []string) []string {
	if cld == nil {
		return nil
	}
	keep := make(map[string]bool, len(ordered))
	for _, url := range ordered {
		keep[url] = true
	}
	seen := map[string]bool{}
	var ids []string
	for _, img := range images {
		if keep[img.Url] || seen[img.PublicID] || !cld.Owns(img.Url, img.PublicID) {
			continue
		}
		seen[img.PublicID] = true
		ids = append(ids, img.PublicID)
	}
	return ids
}

// deleteImages removes images from Cloudinary, best effort.
func deleteImages(cld *cloudinary.Client, publicIDs []string) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	for _, id := range publicIDs {
		if err := cld.DeleteImage(ctx, id); err != nil {
			slog.Warn("cloudinary: delete image", "public_id", id, "err", err)
		}
	}
}
