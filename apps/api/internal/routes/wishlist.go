package routes

import (
	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/handlers/wishlist"
	"github.com/suprimkhatri77/cartspace/backend/internal/middleware"
	"github.com/suprimkhatri77/cartspace/backend/internal/routes/config"
)

func setupWishlistRoutes(router *gin.RouterGroup, cfg config.Config) {
	w := router.Group("/wishlist", middleware.RequireAuth(cfg.Config))
	w.GET("", wishlist.List(cfg.Queries))
	w.GET("/ids", wishlist.IDs(cfg.Queries))
	w.PUT("/:productID", wishlist.Add(cfg.Queries))
	w.DELETE("/:productID", wishlist.Remove(cfg.Queries))
}
