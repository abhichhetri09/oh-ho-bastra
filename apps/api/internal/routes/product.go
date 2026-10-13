package routes

import (
	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	adminProduct "github.com/suprimkhatri77/cartspace/backend/internal/handlers/product/admin"
	userProduct "github.com/suprimkhatri77/cartspace/backend/internal/handlers/product/user"
	"github.com/suprimkhatri77/cartspace/backend/internal/handlers/review"
	"github.com/suprimkhatri77/cartspace/backend/internal/middleware"
	"github.com/suprimkhatri77/cartspace/backend/internal/routes/config"
)

func setupProductRoutes(router *gin.RouterGroup, cfg config.Config) {
	admin := router.Group("/admin/products", middleware.RequireAuth(cfg.Config), middleware.RequireRole(constants.RoleAdmin))
	admin.POST("", adminProduct.CreateProduct(cfg.Queries))
	admin.PUT("/:productID", adminProduct.UpdateProduct(cfg.Queries))
	admin.DELETE("/:productID", adminProduct.DeleteProduct(cfg.Queries, cfg.CldClient))
	admin.GET("", adminProduct.GetPaginatedProducts(cfg.Queries))
	admin.GET("/:productID", adminProduct.GetProductByID(cfg.Queries))
	admin.GET("/:productID/variants", adminProduct.ListVariants(cfg.Queries))

	public := router.Group("/products")
	public.GET("", userProduct.ListProducts(cfg.Queries))
	public.GET("/:productSlug", userProduct.GetProduct(cfg.Queries))

	public.GET("/:productSlug/reviews", review.List(cfg.Queries))
	mine := public.Group("/:productSlug/reviews", middleware.RequireAuth(cfg.Config))
	mine.GET("/mine", review.Mine(cfg.Queries))
	mine.PUT("", review.Write(cfg.Queries))
	mine.DELETE("", review.Delete(cfg.Queries))
}
