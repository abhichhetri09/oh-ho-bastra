package app

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/database"
)

func TestClientIPIgnoresForwardedForUnlessProxyTrusted(t *testing.T) {
	gin.SetMode(gin.TestMode)

	clientIP := func(t *testing.T, trusted []string) string {
		r, err := buildRouter(&config.Config{TrustedProxies: trusted}, nil, nil, &database.DB{}, nil, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		r.GET("/ip", func(c *gin.Context) { c.String(http.StatusOK, c.ClientIP()) })
		req := httptest.NewRequest(http.MethodGet, "/ip", nil)
		req.RemoteAddr = "10.0.0.5:1234"
		req.Header.Set("X-Forwarded-For", "6.6.6.6")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Body.String()
	}

	if got := clientIP(t, nil); got != "10.0.0.5" {
		t.Fatalf("no trusted proxies: ClientIP = %q, want the socket address", got)
	}
	if got := clientIP(t, []string{"10.0.0.0/8"}); got != "6.6.6.6" {
		t.Fatalf("trusted proxy: ClientIP = %q, want the forwarded address", got)
	}
	if _, err := buildRouter(&config.Config{TrustedProxies: []string{"not-an-ip"}}, nil, nil, &database.DB{}, nil, nil, nil); err == nil {
		t.Fatal("invalid TRUSTED_PROXIES must fail startup")
	}
}

func TestUnknownRouteAndMethodReturnJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r, err := buildRouter(&config.Config{}, nil, nil, &database.DB{}, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		method, path string
		status       int
		code         string
	}{
		{http.MethodGet, "/api/v1/nope", http.StatusNotFound, `"code":"ROUTE_NOT_FOUND"`},
		{http.MethodDelete, "/api/v1/health", http.StatusMethodNotAllowed, `"code":"METHOD_NOT_ALLOWED"`},
	}
	for _, tt := range tests {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(tt.method, tt.path, nil))

		if w.Code != tt.status || !strings.Contains(w.Body.String(), tt.code) {
			t.Errorf("%s %s = %d %s, want %d %s", tt.method, tt.path, w.Code, w.Body, tt.status, tt.code)
		}
		if w.Header().Get("X-Request-ID") == "" {
			t.Errorf("%s %s: global middleware skipped (no X-Request-ID)", tt.method, tt.path)
		}
	}
}
