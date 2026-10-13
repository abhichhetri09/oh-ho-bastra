package routes

import (
	"testing"

	"github.com/gin-gonic/gin"

	appconfig "github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/routes/config"
)

func TestSetupRegistersAllRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	Setup(r, config.Config{Config: &appconfig.Config{}})

	want := []string{
		"GET /",
		"GET /docs",
		"GET /api/v1/health",
		"GET /api/v1/openapi.json",
		"GET /api/v1/docs",
		"GET /api/v1/docs/",

		"POST /api/v1/auth/register",
		"POST /api/v1/auth/login",
		"POST /api/v1/auth/logout",
		"POST /api/v1/auth/refresh",
		"GET /api/v1/auth/me",
		"PATCH /api/v1/auth/me",
		"POST /api/v1/auth/me/password",
		"POST /api/v1/auth/password/forgot",
		"POST /api/v1/auth/password/reset",

		"POST /api/v1/admin/categories",
		"PUT /api/v1/admin/categories/:id",
		"DELETE /api/v1/admin/categories/:id",
		"GET /api/v1/admin/categories",
		"GET /api/v1/categories",
		"GET /api/v1/categories/:slug",

		"POST /api/v1/admin/products",
		"PUT /api/v1/admin/products/:productID",
		"DELETE /api/v1/admin/products/:productID",
		"GET /api/v1/admin/products",
		"GET /api/v1/admin/products/:productID",
		"GET /api/v1/admin/products/:productID/variants",
		"GET /api/v1/admin/stats",
		"POST /api/v1/admin/uploads/signature",
		"GET /api/v1/admin/orders",
		"GET /api/v1/admin/orders/:number",
		"POST /api/v1/admin/orders/:number/ship",
		"POST /api/v1/admin/orders/:number/deliver",
		"POST /api/v1/admin/orders/:number/cancel",
		"POST /api/v1/admin/orders/:number/refund",
		"GET /api/v1/admin/reviews",
		"PUT /api/v1/admin/reviews/:id/status",
		"PUT /api/v1/admin/settings",
		"GET /api/v1/settings",
		"GET /api/v1/products",
		"GET /api/v1/products/:productSlug",
		"GET /api/v1/products/:productSlug/reviews",
		"GET /api/v1/products/:productSlug/reviews/mine",
		"PUT /api/v1/products/:productSlug/reviews",
		"DELETE /api/v1/products/:productSlug/reviews",

		"POST /api/v1/admin/products/:productID/variants",
		"PUT /api/v1/admin/products/:productID/variants/:variantID",
		"DELETE /api/v1/admin/products/:productID/variants/:variantID",
		"GET /api/v1/admin/products/:productID/variants/:variantID",
		"PUT /api/v1/admin/products/:productID/variants/:variantID/stock",

		"GET /api/v1/cart",
		"DELETE /api/v1/cart",
		"POST /api/v1/cart/items",
		"PATCH /api/v1/cart/items/:variantID",
		"DELETE /api/v1/cart/items/:variantID",

		"POST /api/v1/checkout",
		"GET /api/v1/checkout/sessions/:sessionID",
		"POST /api/v1/webhooks/stripe",
		"GET /api/v1/orders",
		"GET /api/v1/orders/:number",
		"GET /api/v1/admin/counts",
		"GET /api/v1/admin/search",
		"GET /api/v1/admin/orders/export.csv",
		"GET /api/v1/admin/inventory",
		"GET /api/v1/admin/emails",
		"POST /api/v1/admin/emails/:emailID/retry",
		"GET /api/v1/admin/customers",
		"GET /api/v1/admin/customers/:userID",
		"GET /api/v1/addresses",
		"DELETE /api/v1/addresses/:addressID",
		"PUT /api/v1/addresses/:addressID/default",

		"GET /api/v1/wishlist",
		"GET /api/v1/wishlist/ids",
		"PUT /api/v1/wishlist/:productID",
		"DELETE /api/v1/wishlist/:productID",
	}

	got := map[string]bool{}
	for _, route := range r.Routes() {
		got[route.Method+" "+route.Path] = true
	}
	for _, w := range want {
		if !got[w] {
			t.Errorf("missing route %s", w)
		}
	}
	if len(got) != len(want) {
		t.Errorf("registered %d routes, want %d", len(got), len(want))
	}
}
