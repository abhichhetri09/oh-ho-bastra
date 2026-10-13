package app

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/checkout"
	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	"github.com/suprimkhatri77/cartspace/backend/internal/database"
	dbgen "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/emails"
	"github.com/suprimkhatri77/cartspace/backend/internal/middleware"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/cloudinary"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/payments"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/routes"
	routesconfig "github.com/suprimkhatri77/cartspace/backend/internal/routes/config"
)

func buildRouter(
	cfg *config.Config,
	queries *dbgen.Queries,
	cld *cloudinary.Client,
	db *database.DB,
	provider payments.Provider,
	checkoutSvc *checkout.Service,
	mailer emails.Sender,
) (*gin.Engine, error) {
	r := gin.New()
	// Only listed proxies may set X-Forwarded-For; otherwise ClientIP() is
	// the socket address, so clients can't spoof the ip we log and store.
	if err := r.SetTrustedProxies(cfg.TrustedProxies); err != nil {
		return nil, fmt.Errorf("TRUSTED_PROXIES: %w", err)
	}
	r.Use(middleware.RequestID())
	r.Use(middleware.Recovery())
	r.Use(gin.Logger())
	r.Use(middleware.CORS(cfg))

	// JSON for unknown paths and wrong methods too; the global middleware
	// above (request ID, CORS) still runs for them.
	r.HandleMethodNotAllowed = true
	r.NoRoute(func(c *gin.Context) {
		httpx.Fail(c, http.StatusNotFound, constants.RouteNotFound, "Route not found")
	})
	r.NoMethod(func(c *gin.Context) {
		httpx.Fail(c, http.StatusMethodNotAllowed, constants.MethodNotAllowed, "Method not allowed")
	})

	routes.Setup(r, routesconfig.Config{
		Config:      cfg,
		Queries:     queries,
		CldClient:   cld,
		PgxPool:     db.Pool,
		VariantRepo: repository.NewVariantRepository(queries),
		CartRepo:    repository.NewCartRepository(queries),
		Payments:    provider,
		Checkout:    checkoutSvc,
		Mailer:      mailer,
	})
	return r, nil
}
