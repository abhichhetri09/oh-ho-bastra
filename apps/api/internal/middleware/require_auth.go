package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"

	session "github.com/suprimkhatri77/cartspace/backend/internal/auth"
	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/rlog"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

// RequireAuth accepts a valid access token cookie and stores the user id and
// role on the context. Any failure is a 401 so the client can try a refresh.
func RequireAuth(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie(session.AccessCookie)
		if err != nil || token == "" {
			rlog.Warn(c, "missing access token")
			c.AbortWithStatusJSON(http.StatusUnauthorized, types.APIResponse{
				Success: false,
				Message: "Missing access token",
				Code:    constants.MissingAccessToken,
			})
			return
		}

		claims, err := session.ParseAccess(token, cfg.JWTAccessSecret)
		if err != nil {
			rlog.Warn(c, "invalid access token", "error", err)
			c.AbortWithStatusJSON(http.StatusUnauthorized, types.APIResponse{
				Success: false,
				Message: "Invalid access token",
				Code:    constants.InvalidAccessToken,
			})
			return
		}

		if !constants.IsValidRole(claims.Role) {
			rlog.Warn(c, "invalid role in access token", "role", claims.Role)
			c.AbortWithStatusJSON(http.StatusUnauthorized, types.APIResponse{
				Success: false,
				Message: "Invalid access token",
				Code:    constants.InvalidTokenClaims,
			})
			return
		}

		c.Set(constants.UserIDKey, claims.UserID)
		c.Set(constants.RoleKey, claims.Role)
		c.Next()
	}
}
