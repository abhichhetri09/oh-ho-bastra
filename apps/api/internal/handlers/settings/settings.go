// Package settings serves the store-wide settings the storefront needs.
package settings

import (
	"net/http"

	"github.com/gin-gonic/gin"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

// Get is the store's public settings (its theme).
func Get(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		settings, err := queries.GetStoreSettings(c.Request.Context())
		if err != nil {
			httpx.Internal(c, "failed to load store settings", err)
			return
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Store settings fetched", Data: settings})
	}
}
