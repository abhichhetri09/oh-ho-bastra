package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	session "github.com/suprimkhatri77/cartspace/backend/internal/auth"
	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

func TestRequireAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{
		JWTAccessSecret:  strings.Repeat("a", 32),
		JWTRefreshSecret: strings.Repeat("r", 32),
		AccessTokenTTL:   time.Minute,
	}
	userID := "11111111-1111-1111-1111-111111111111"
	user := func(role string) db.User {
		return db.User{ID: pgtype.UUID{Bytes: uuid.MustParse(userID), Valid: true}, Role: role}
	}
	access, _ := session.NewAccessToken(cfg, user(constants.RoleAdmin))
	badRole, _ := session.NewAccessToken(cfg, user("superuser"))
	refresh, _ := session.SignRefresh(cfg, user(constants.RoleAdmin), pgtype.UUID{Bytes: uuid.New(), Valid: true}, time.Now().Add(time.Hour))
	expiredCfg := *cfg
	expiredCfg.AccessTokenTTL = -time.Minute
	expired, _ := session.NewAccessToken(&expiredCfg, user(constants.RoleAdmin))

	tests := []struct {
		name     string
		cookie   string
		wantCode int
	}{
		{"valid token", access, http.StatusOK},
		{"missing token", "", http.StatusUnauthorized},
		{"garbage", "nope", http.StatusUnauthorized},
		{"expired", expired, http.StatusUnauthorized},
		{"refresh token as access", refresh, http.StatusUnauthorized},
		{"unknown role", badRole, http.StatusUnauthorized},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var gotUser, gotRole string
			r := gin.New()
			r.GET("/", RequireAuth(cfg), func(c *gin.Context) {
				gotUser, gotRole = c.GetString(constants.UserIDKey), c.GetString(constants.RoleKey)
				c.Status(http.StatusOK)
			})
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tt.cookie != "" {
				req.AddCookie(&http.Cookie{Name: session.AccessCookie, Value: tt.cookie})
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != tt.wantCode {
				t.Fatalf("code %d, want %d", w.Code, tt.wantCode)
			}
			if tt.wantCode == http.StatusOK && (gotUser != userID || gotRole != constants.RoleAdmin) {
				t.Fatalf("context user %q role %q", gotUser, gotRole)
			}
		})
	}
}
