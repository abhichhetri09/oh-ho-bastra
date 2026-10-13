// Package wishlist serves the signed-in user's saved products.
package wishlist

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

const (
	// MaxItems caps a wishlist, so GET /wishlist/ids can return it whole.
	MaxItems = 200
	pageSize = int64(24)
)

// List is the saved products still on sale, newest saved first.
func List(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := httpx.UserID(c)
		if !ok {
			return
		}
		page, ok := httpx.ParsePage(c)
		if !ok {
			return
		}
		ctx := c.Request.Context()
		total, err := queries.CountWishlistProducts(ctx, userID)
		if err != nil {
			httpx.Internal(c, "failed to count wishlist", err)
			return
		}
		if !httpx.CheckPageInRange(c, page, total, pageSize) {
			return
		}
		items := []db.ListWishlistProductsRow{}
		if total > 0 {
			items, err = queries.ListWishlistProducts(ctx, db.ListWishlistProductsParams{
				UserID: userID,
				Limit:  int32(pageSize),
				Offset: httpx.Offset(page, pageSize),
			})
			if err != nil {
				httpx.Internal(c, "failed to list wishlist", err)
				return
			}
		}
		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Wishlist fetched",
			Data:    items,
			Meta:    types.NewPaginationMeta(total, page, pageSize),
		})
	}
}

// IDs is every saved product id, for showing hearts anywhere products are.
func IDs(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := httpx.UserID(c)
		if !ok {
			return
		}
		ids, err := queries.ListWishlistIDs(c.Request.Context(), userID)
		if err != nil {
			httpx.Internal(c, "failed to list wishlist ids", err)
			return
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Wishlist fetched", Data: ids})
	}
}

// Add saves a product on sale. Saving it again changes nothing.
func Add(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, productID, ok := params(c)
		if !ok {
			return
		}
		ctx := c.Request.Context()
		exists, err := queries.StorefrontProductExists(ctx, productID)
		if err != nil {
			httpx.Internal(c, "failed to check product", err)
			return
		}
		if !exists {
			httpx.Fail(c, http.StatusNotFound, constants.ProductNotFound, "Product not found")
			return
		}
		// Not transactional: two racing adds can overshoot the cap by one,
		// which is harmless, while ON CONFLICT keeps rows unique.
		count, err := queries.CountWishlistItems(ctx, userID)
		if err != nil {
			httpx.Internal(c, "failed to count wishlist", err)
			return
		}
		if count >= MaxItems {
			httpx.Fail(c, http.StatusConflict, constants.WishlistFull, "Your wishlist is full (200 items)")
			return
		}
		if err := queries.AddWishlistItem(ctx, db.AddWishlistItemParams{UserID: userID, ProductID: productID}); err != nil {
			httpx.Internal(c, "failed to save product", err)
			return
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Saved to your wishlist"})
	}
}

// Remove unsaves a product. Removing one that isn't saved succeeds.
func Remove(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, productID, ok := params(c)
		if !ok {
			return
		}
		if err := queries.RemoveWishlistItem(c.Request.Context(), db.RemoveWishlistItemParams{UserID: userID, ProductID: productID}); err != nil {
			httpx.Internal(c, "failed to remove product", err)
			return
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Removed from your wishlist"})
	}
}

func params(c *gin.Context) (pgtype.UUID, pgtype.UUID, bool) {
	userID, ok := httpx.UserID(c)
	if !ok {
		return pgtype.UUID{}, pgtype.UUID{}, false
	}
	productID, ok := httpx.PathUUID(c, "productID", constants.InvalidProductID, "product ID")
	return userID, productID, ok
}
