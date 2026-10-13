package admin

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
)

func TestSafeCell(t *testing.T) {
	for in, want := range map[string]string{
		"Ada Lovelace":       "Ada Lovelace",
		"=HYPERLINK(\"x\")":  "'=HYPERLINK(\"x\")",
		"+44 20 7946 0958":   "'+44 20 7946 0958",
		"-1+1":               "'-1+1",
		"@SUM(A1)":           "'@SUM(A1)",
		"\tcmd":              "'\tcmd",
		"":                   "",
		"ada@example.org":    "ada@example.org",
		"1Z999AA10123456784": "1Z999AA10123456784",
	} {
		if got := safeCell(in); got != want {
			t.Errorf("safeCell(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestMoney(t *testing.T) {
	for cents, want := range map[int64]string{0: "0.00", 5: "0.05", 1250: "12.50", 123456: "1234.56"} {
		if got := money(cents); got != want {
			t.Errorf("money(%d) = %q, want %q", cents, got, want)
		}
	}
}

// Bad filters are refused before any query runs (the handlers get no DB).
func TestOrderFiltersRefused(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/orders", ListOrders(nil))
	r.GET("/export", ExportOrders(nil))
	r.GET("/search", Search(nil))
	r.GET("/customers", ListCustomers(nil))
	for _, path := range []string{
		"/orders?from=12-10-2026",
		"/orders?from=2026-10-12&to=2026-10-01",
		"/orders?sort=email",
		"/orders?sort=total&dir=sideways",
		"/export?to=yesterday",
		"/search?q=",
		"/search?q=" + strings.Repeat("a", 101),
		"/customers?sort=name",
	} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), constants.InvalidQueryParam) {
			t.Errorf("%s: %d %s, want 400", path, w.Code, w.Body.String())
		}
	}
}
