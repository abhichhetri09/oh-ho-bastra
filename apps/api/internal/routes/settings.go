package routes

import (
	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/handlers/settings"
	"github.com/suprimkhatri77/cartspace/backend/internal/routes/config"
)

func setupSettingsRoutes(router *gin.RouterGroup, cfg config.Config) {
	router.GET("/settings", settings.Get(cfg.Queries))
}
