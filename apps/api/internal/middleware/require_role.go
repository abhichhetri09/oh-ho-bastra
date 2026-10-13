package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/rlog"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

// RequireRole allows the request through only if the authenticated user has
// one of the given roles. It must run after RequireAuth.
func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := c.GetString(constants.RoleKey)

		for _, r := range roles {
			if role == r {
				c.Next()
				return
			}
		}

		rlog.Warn(c, "insufficient permissions", "role", role)

		c.AbortWithStatusJSON(http.StatusForbidden, types.APIResponse{
			Success: false,
			Message: "Insufficient permissions",
			Code:    constants.Forbidden,
		})
	}
}
