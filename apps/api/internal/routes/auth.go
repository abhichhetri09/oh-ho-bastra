package routes

import (
	"github.com/gin-gonic/gin"

	authHandler "github.com/suprimkhatri77/cartspace/backend/internal/handlers/auth"
	"github.com/suprimkhatri77/cartspace/backend/internal/middleware"
	"github.com/suprimkhatri77/cartspace/backend/internal/routes/config"
)

func setupAuthRoutes(router *gin.RouterGroup, cfg config.Config) {
	auth := router.Group("/auth")
	auth.POST("/register", authHandler.Register(cfg.Queries, cfg.Config))
	auth.POST("/login", authHandler.Login(cfg.Queries, cfg.Config))
	auth.POST("/logout", authHandler.Logout(cfg.Queries, cfg.Config))
	auth.POST("/refresh", authHandler.Refresh(cfg.Queries, cfg.Config))
	auth.GET("/me", middleware.RequireAuth(cfg.Config), authHandler.Me(cfg.Queries))
	auth.PATCH("/me", middleware.RequireAuth(cfg.Config), authHandler.UpdateProfile(cfg.Queries, cfg.Config))
	auth.POST("/me/password", middleware.RequireAuth(cfg.Config), authHandler.ChangePassword(cfg.PgxPool, cfg.Queries, cfg.Config))
	auth.POST("/password/forgot", authHandler.ForgotPassword(cfg.Queries, cfg.Config, cfg.Mailer))
	auth.POST("/password/reset", authHandler.ResetPassword(cfg.PgxPool, cfg.Queries))
}
