package routes

import (
	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/handlers/cart"
	"github.com/suprimkhatri77/cartspace/backend/internal/middleware"
	"github.com/suprimkhatri77/cartspace/backend/internal/routes/config"
)

func setupCartRoutes(router *gin.RouterGroup, cfg config.Config) {
	carts := router.Group("/cart", middleware.RequireAuth(cfg.Config))
	carts.GET("", cart.GetCart(cfg.CartRepo))
	carts.DELETE("", cart.ClearCart(cfg.CartRepo, cfg.PgxPool))
	carts.POST("/items", cart.AddItem(cfg.CartRepo, cfg.PgxPool))
	carts.PATCH("/items/:variantID", cart.UpdateItem(cfg.CartRepo, cfg.PgxPool))
	carts.DELETE("/items/:variantID", cart.RemoveItem(cfg.CartRepo, cfg.PgxPool))
}
