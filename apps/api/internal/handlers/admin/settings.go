package admin

import (
	"net/http"

	"github.com/gin-gonic/gin"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

// SetStoreTheme switches the storefront's theme.
func SetStoreTheme(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		req, ok := validator.BindJSON[types.StoreThemeBody](c)
		if !ok {
			return
		}
		settings, err := queries.UpdateStoreTheme(c.Request.Context(), req.Theme)
		if err != nil {
			httpx.Internal(c, "failed to update store theme", err)
			return
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Store theme updated", Data: settings})
	}
}
