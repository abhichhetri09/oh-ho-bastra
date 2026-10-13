package routes

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/routes/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

// Setup attaches all routes to the engine under /api/v1.
func Setup(r *gin.Engine, cfg config.Config) {
	r.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Welcome to the Oh Ho Bastra API",
		})
	})

	router := r.Group("/api/v1")

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Server is up and running",
		})
	})

	setupDocsRoutes(r, router, cfg)
	setupAuthRoutes(router, cfg)
	setupCategoryRoutes(router, cfg)
	setupProductRoutes(router, cfg)
	setupVariantRoutes(router, cfg)
	setupCartRoutes(router, cfg)
	setupCheckoutRoutes(router, cfg)
	setupWishlistRoutes(router, cfg)
	setupSettingsRoutes(router, cfg)
	setupAdminRoutes(router, cfg)
}
