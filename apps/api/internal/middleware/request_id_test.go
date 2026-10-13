package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
)

func TestRequestID(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name     string
		incoming string
		wantSame bool
	}{
		{"mints when missing", "", false},
		{"reuses valid id", "abc-123_DEF.456", true},
		{"rejects newline", "abc\nforged log line", false},
		{"rejects space", "abc def", false},
		{"rejects too long", strings.Repeat("a", maxRequestIDLen+1), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var ctxID string
			r := gin.New()
			r.Use(RequestID())
			r.GET("/", func(c *gin.Context) {
				ctxID = c.GetString(constants.RequestIDKey)
				c.Status(http.StatusOK)
			})

			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tt.incoming != "" {
				req.Header.Set(constants.RequestIDHeader, tt.incoming)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			got := w.Header().Get(constants.RequestIDHeader)
			if got == "" || got != ctxID {
				t.Fatalf("header %q and context %q must match and be non-empty", got, ctxID)
			}
			if (got == tt.incoming) != tt.wantSame {
				t.Fatalf("got %q for incoming %q, wantSame=%v", got, tt.incoming, tt.wantSame)
			}
		})
	}
}
