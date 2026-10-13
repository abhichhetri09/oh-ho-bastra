package routes

import (
	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	"github.com/suprimkhatri77/cartspace/backend/internal/handlers/admin"
	"github.com/suprimkhatri77/cartspace/backend/internal/middleware"
	"github.com/suprimkhatri77/cartspace/backend/internal/routes/config"
)

func setupAdminRoutes(router *gin.RouterGroup, cfg config.Config) {
	group := router.Group("/admin", middleware.RequireAuth(cfg.Config), middleware.RequireRole(constants.RoleAdmin))
	group.GET("/stats", admin.GetStats(cfg.Queries))
	group.GET("/counts", admin.GetCounts(cfg.Queries))
	group.GET("/search", admin.Search(cfg.Queries))
	group.GET("/inventory", admin.ListInventory(cfg.Queries))
	group.GET("/emails", admin.ListEmails(cfg.Queries))
	group.POST("/emails/:emailID/retry", admin.RetryEmail(cfg.Queries))
	group.POST("/uploads/signature", admin.SignUpload(cfg.CldClient))

	orders := group.Group("/orders")
	orders.GET("", admin.ListOrders(cfg.Queries))
	orders.GET("/export.csv", admin.ExportOrders(cfg.Queries))
	orders.GET("/:number", admin.GetOrder(cfg.Queries))
	orders.POST("/:number/ship", admin.ShipOrder(cfg.Checkout, cfg.Queries))
	orders.POST("/:number/deliver", admin.DeliverOrder(cfg.Checkout, cfg.Queries))
	orders.POST("/:number/cancel", admin.CancelOrder(cfg.Checkout, cfg.Queries))
	orders.POST("/:number/refund", admin.RefundOrder(cfg.Checkout, cfg.Queries))

	customers := group.Group("/customers")
	customers.GET("", admin.ListCustomers(cfg.Queries))
	customers.GET("/:userID", admin.GetCustomer(cfg.Queries))

	group.GET("/reviews", admin.ListReviews(cfg.Queries))
	group.PUT("/reviews/:id/status", admin.SetReviewStatus(cfg.Queries))

	group.PUT("/settings", admin.SetStoreTheme(cfg.Queries))
}
