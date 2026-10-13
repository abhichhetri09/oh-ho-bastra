package auth

import "github.com/golang-jwt/jwt/v5"

// Token types, carried in the "typ" claim and checked on parse so an access
// token can never be accepted as a refresh token or vice versa.
const (
	TokenTypeAccess  = "access"
	TokenTypeRefresh = "refresh"
)

// AccessClaims is the short-lived token checked by RequireAuth. The web app
// decodes these claim names, so keep them stable.
type AccessClaims struct {
	UserID   string `json:"user_id"`
	Role     string `json:"role"`
	Email    string `json:"email"`
	Name     string `json:"name"`
	ImageURL string `json:"image_url,omitempty"`
	Type     string `json:"typ"`
	jwt.RegisteredClaims
}

// RefreshClaims identifies the session ("token family") a refresh token belongs to.
type RefreshClaims struct {
	UserID   string `json:"user_id"`
	FamilyID string `json:"family_id"`
	Type     string `json:"typ"`
	jwt.RegisteredClaims
}
