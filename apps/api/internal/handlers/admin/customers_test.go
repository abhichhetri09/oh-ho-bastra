package admin

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
)

// Bad input is refused before any query runs (the handlers get no DB).
func TestCustomerInputRefused(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/customers", ListCustomers(nil))
	r.GET("/customers/:userID", GetCustomer(nil))
	r.GET("/orders", ListOrders(nil))
	for _, tt := range []struct{ path, code string }{
		{"/customers/nope", constants.InvalidUserID},
		{"/customers?q=" + strings.Repeat("a", 101), constants.InvalidQueryParam},
		{"/customers?page=0", constants.InvalidPageParam},
		{"/orders?customer=nope", constants.InvalidQueryParam},
	} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, tt.path, nil))
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), tt.code) {
			t.Errorf("%s: %d %s, want 400 %s", tt.path, w.Code, w.Body.String(), tt.code)
		}
	}
}
