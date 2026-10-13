package routes

import (
	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	adminCategory "github.com/suprimkhatri77/cartspace/backend/internal/handlers/category/admin"
	userCategory "github.com/suprimkhatri77/cartspace/backend/internal/handlers/category/user"
	userProduct "github.com/suprimkhatri77/cartspace/backend/internal/handlers/product/user"
	"github.com/suprimkhatri77/cartspace/backend/internal/middleware"
	"github.com/suprimkhatri77/cartspace/backend/internal/routes/config"
)

func setupCategoryRoutes(router *gin.RouterGroup, cfg config.Config) {
	admin := router.Group("/admin/categories", middleware.RequireAuth(cfg.Config), middleware.RequireRole(constants.RoleAdmin))
	admin.POST("", adminCategory.CreateCategory(cfg.Queries))
	admin.PUT("/:id", adminCategory.UpdateCategory(cfg.Queries))
	admin.DELETE("/:id", adminCategory.DeleteCategory(cfg.Queries))
	admin.GET("", adminCategory.GetPaginatedCategories(cfg.Queries))

	public := router.Group("/categories")
	public.GET("", userCategory.ListCategories(cfg.Queries))
	public.GET("/:slug", userProduct.ListProductByCategory(cfg.Queries))
}
