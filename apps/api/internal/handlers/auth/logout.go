package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"

	session "github.com/suprimkhatri77/cartspace/backend/internal/auth"
	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/rlog"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
)

// Logout always succeeds: cookies are cleared first, then the session is
// revoked best-effort so a later refresh with a copied token fails.
func Logout(queries repository.AuthRepository, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, _ := c.Cookie(session.RefreshCookie)
		session.ClearSessionCookies(c, cfg)

		if claims, err := session.ParseRefresh(token, cfg.JWTRefreshSecret); err == nil {
			if familyID, err := utils.ConvertToUUID(claims.FamilyID); err == nil {
				if err := queries.RevokeSession(c.Request.Context(), familyID); err != nil {
					rlog.Error(c, "failed to revoke session on logout", err, "family_id", claims.FamilyID)
				}
			}
		}

		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Logged out successfully"})
	}
}
