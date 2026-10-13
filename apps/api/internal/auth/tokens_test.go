package auth

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

const (
	testUserID   = "11111111-1111-1111-1111-111111111111"
	testFamilyID = "22222222-2222-2222-2222-222222222222"
)

func testConfig() *config.Config {
	return &config.Config{
		JWTAccessSecret:    strings.Repeat("a", 32),
		JWTRefreshSecret:   strings.Repeat("r", 32),
		AccessTokenTTL:     15 * time.Minute,
		RefreshTokenTTL:    30 * 24 * time.Hour,
		RefreshReuseWindow: 30 * time.Second,
		MaxSessionAge:      90 * 24 * time.Hour,
	}
}

func testUser() db.User {
	return db.User{
		ID:    pgtype.UUID{Bytes: uuid.MustParse(testUserID), Valid: true},
		Name:  "Ada Lovelace",
		Email: "ada@example.com",
		Role:  constants.RoleCustomer,
	}
}

func testFamily() pgtype.UUID {
	return pgtype.UUID{Bytes: uuid.MustParse(testFamilyID), Valid: true}
}

func TestAccessRoundTrip(t *testing.T) {
	cfg := testConfig()
	token, err := NewAccessToken(cfg, testUser())
	if err != nil {
		t.Fatal(err)
	}
	claims, err := ParseAccess(token, cfg.JWTAccessSecret)
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID != testUserID || claims.Role != constants.RoleCustomer || claims.Email != "ada@example.com" || claims.Type != TokenTypeAccess {
		t.Fatalf("unexpected claims %+v", claims)
	}
}

func TestRefreshRoundTripUsesGivenExpiry(t *testing.T) {
	cfg := testConfig()
	exp := time.Now().Add(time.Hour).Truncate(time.Second)
	token, err := SignRefresh(cfg, testUser(), testFamily(), exp)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := ParseRefresh(token, cfg.JWTRefreshSecret)
	if err != nil {
		t.Fatal(err)
	}
	if claims.FamilyID != testFamilyID || claims.UserID != testUserID {
		t.Fatalf("unexpected claims %+v", claims)
	}
	if !claims.ExpiresAt.Equal(exp) {
		t.Fatalf("exp = %v, want %v", claims.ExpiresAt, exp)
	}
}

// Two pairs signed in the same instant must differ (the old same-second bug).
func TestNewTokensAreUnique(t *testing.T) {
	cfg := testConfig()
	exp := time.Now().Add(time.Hour)
	a, err := NewTokens(cfg, testUser(), testFamily(), exp)
	if err != nil {
		t.Fatal(err)
	}
	b, err := NewTokens(cfg, testUser(), testFamily(), exp)
	if err != nil {
		t.Fatal(err)
	}
	if a.RefreshToken == b.RefreshToken || a.AccessToken == b.AccessToken {
		t.Fatal("tokens signed back to back must differ")
	}
}

func TestParseRejects(t *testing.T) {
	cfg := testConfig()
	access, _ := NewAccessToken(cfg, testUser())
	refresh, _ := SignRefresh(cfg, testUser(), testFamily(), time.Now().Add(time.Hour))

	// same key for both, to prove the typ claim (not just the key) separates them
	shared := strings.Repeat("s", 32)
	sharedCfg := testConfig()
	sharedCfg.JWTAccessSecret, sharedCfg.JWTRefreshSecret = shared, shared
	sharedAccess, _ := NewAccessToken(sharedCfg, testUser())
	sharedRefresh, _ := SignRefresh(sharedCfg, testUser(), testFamily(), time.Now().Add(time.Hour))

	expired, _ := SignRefresh(cfg, testUser(), testFamily(), time.Now().Add(-time.Minute))
	hs384, _ := jwt.NewWithClaims(jwt.SigningMethodHS384, AccessClaims{
		UserID: testUserID, Role: constants.RoleCustomer, Type: TokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute))},
	}).SignedString([]byte(cfg.JWTAccessSecret))
	noExp, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, AccessClaims{
		UserID: testUserID, Role: constants.RoleCustomer, Type: TokenTypeAccess,
	}).SignedString([]byte(cfg.JWTAccessSecret))

	tests := []struct {
		name  string
		parse func() error
	}{
		{"access with wrong secret", func() error { _, err := ParseAccess(access, "x"+cfg.JWTAccessSecret); return err }},
		{"refresh with access secret", func() error { _, err := ParseRefresh(refresh, cfg.JWTAccessSecret); return err }},
		{"refresh token as access (shared key)", func() error { _, err := ParseAccess(sharedRefresh, shared); return err }},
		{"access token as refresh (shared key)", func() error { _, err := ParseRefresh(sharedAccess, shared); return err }},
		{"expired refresh", func() error { _, err := ParseRefresh(expired, cfg.JWTRefreshSecret); return err }},
		{"hs384 access", func() error { _, err := ParseAccess(hs384, cfg.JWTAccessSecret); return err }},
		{"access without exp", func() error { _, err := ParseAccess(noExp, cfg.JWTAccessSecret); return err }},
		{"garbage", func() error { _, err := ParseAccess("not.a.jwt", cfg.JWTAccessSecret); return err }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.parse() == nil {
				t.Fatal("expected an error")
			}
		})
	}
}

func TestHashRefreshToken(t *testing.T) {
	a1, a2, b := HashRefreshToken("a"), HashRefreshToken("a"), HashRefreshToken("b")
	if a1 != a2 || a1 == b || len(a1) != 64 {
		t.Fatal("hash must be a deterministic sha256 hex digest")
	}
}
