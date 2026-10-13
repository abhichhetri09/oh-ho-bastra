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
func TestOperationsInputRefused(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/inventory", ListInventory(nil))
	r.GET("/emails", ListEmails(nil))
	r.POST("/emails/:emailID/retry", RetryEmail(nil))
	for _, tt := range []struct{ method, path, code string }{
		{http.MethodGet, "/inventory?stock=some", constants.InvalidQueryParam},
		{http.MethodGet, "/inventory?hidden=yes", constants.InvalidQueryParam},
		{http.MethodGet, "/inventory?q=" + strings.Repeat("a", 101), constants.InvalidQueryParam},
		{http.MethodGet, "/emails?status=lost", constants.InvalidQueryParam},
		{http.MethodGet, "/emails?page=-1", constants.InvalidPageParam},
		{http.MethodPost, "/emails/nope/retry", constants.InvalidEmailID},
	} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(tt.method, tt.path, nil))
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), tt.code) {
			t.Errorf("%s %s: %d %s, want 400 %s", tt.method, tt.path, w.Code, w.Body.String(), tt.code)
		}
	}
}
