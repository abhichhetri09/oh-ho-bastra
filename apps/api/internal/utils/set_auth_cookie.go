package utils

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/suprimkhatri77/cartspace/backend/internal/config"
)

// SetAuthCookie sets an httpOnly cookie (Secure + domain only in release).
func SetAuthCookie(c *gin.Context, name, value string, maxAge int, cfg *config.Config) {
	setCookie(c, name, value, maxAge, cfg, true)
}

// SetPublicCookie sets a cookie readable by JS; never put secrets in it.
func SetPublicCookie(c *gin.Context, name, value string, maxAge int, cfg *config.Config) {
	setCookie(c, name, value, maxAge, cfg, false)
}

func setCookie(c *gin.Context, name, value string, maxAge int, cfg *config.Config, httpOnly bool) {
	secure := cfg.GinMode == "release"
	domain := ""
	if secure {
		domain = cfg.CookieDomain
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(name, value, maxAge, "/", domain, secure, httpOnly)
}
