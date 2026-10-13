package routes

import (
	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/handlers/checkout"
	"github.com/suprimkhatri77/cartspace/backend/internal/middleware"
	"github.com/suprimkhatri77/cartspace/backend/internal/routes/config"
)

func setupCheckoutRoutes(router *gin.RouterGroup, cfg config.Config) {
	auth := middleware.RequireAuth(cfg.Config)

	router.POST("/checkout", auth, checkout.StartCheckout(cfg.Checkout))
	router.GET("/checkout/sessions/:sessionID", auth, checkout.SessionOrder(cfg.Checkout, cfg.Queries))
	// Stripe calls this; the signature is its authentication.
	router.POST("/webhooks/stripe", checkout.StripeWebhook(cfg.Checkout, cfg.Payments))

	orders := router.Group("/orders", auth)
	orders.GET("", checkout.ListOrders(cfg.Queries))
	orders.GET("/:number", checkout.GetOrder(cfg.Queries))

	addresses := router.Group("/addresses", auth)
	addresses.GET("", checkout.ListAddresses(cfg.Queries))
	addresses.DELETE("/:addressID", checkout.DeleteAddress(cfg.Queries))
	addresses.PUT("/:addressID/default", checkout.SetDefaultAddress(cfg.PgxPool, cfg.Queries))
}
