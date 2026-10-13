package routes

import (
	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	adminVariant "github.com/suprimkhatri77/cartspace/backend/internal/handlers/variant/admin"
	"github.com/suprimkhatri77/cartspace/backend/internal/middleware"
	"github.com/suprimkhatri77/cartspace/backend/internal/routes/config"
)

func setupVariantRoutes(router *gin.RouterGroup, cfg config.Config) {
	admin := router.Group("/admin/products/:productID/variants", middleware.RequireAuth(cfg.Config), middleware.RequireRole(constants.RoleAdmin))
	admin.POST("", adminVariant.CreateProductVariant(cfg.VariantRepo, cfg.PgxPool))
	admin.PUT("/:variantID", adminVariant.UpdateProductVariant(cfg.VariantRepo, cfg.PgxPool))
	admin.DELETE("/:variantID", adminVariant.DeleteVariant(cfg.VariantRepo))
	admin.GET("/:variantID", adminVariant.GetByVariantID(cfg.VariantRepo))
	admin.PUT("/:variantID/stock", adminVariant.SetVariantStock(cfg.VariantRepo))
}
