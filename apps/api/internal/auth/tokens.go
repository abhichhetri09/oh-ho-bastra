package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

type Tokens struct {
	AccessToken  string
	RefreshToken string
}

// HashRefreshToken is what the sessions table stores; raw refresh tokens never hit the DB.
func HashRefreshToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// NewTokens signs a fresh access/refresh pair. Every call uses a new random
// jti, so two pairs are never byte-identical, even within the same second.
func NewTokens(cfg *config.Config, user db.User, familyID pgtype.UUID, refreshExpiresAt time.Time) (*Tokens, error) {
	accessToken, err := NewAccessToken(cfg, user)
	if err != nil {
		return nil, err
	}

	refreshToken, err := SignRefresh(cfg, user, familyID, refreshExpiresAt)
	if err != nil {
		return nil, err
	}

	return &Tokens{AccessToken: accessToken, RefreshToken: refreshToken}, nil
}

func NewAccessToken(cfg *config.Config, user db.User) (string, error) {
	if !user.ID.Valid {
		return "", errors.New("user id is null")
	}

	claims := AccessClaims{
		UserID:   uuid.UUID(user.ID.Bytes).String(),
		Role:     user.Role,
		Email:    user.Email,
		Name:     user.Name,
		ImageURL: user.ImageUrl.String,
		Type:     TokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(cfg.AccessTokenTTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(cfg.JWTAccessSecret))
}

func SignRefresh(cfg *config.Config, user db.User, familyID pgtype.UUID, expiresAt time.Time) (string, error) {
	if !user.ID.Valid || !familyID.Valid {
		return "", errors.New("user id or family id is null")
	}

	claims := RefreshClaims{
		UserID:   uuid.UUID(user.ID.Bytes).String(),
		FamilyID: uuid.UUID(familyID.Bytes).String(),
		Type:     TokenTypeRefresh,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(cfg.JWTRefreshSecret))
}

func ParseAccess(tokenString, secret string) (*AccessClaims, error) {
	claims := &AccessClaims{}
	if err := parse(tokenString, secret, claims); err != nil {
		return nil, err
	}
	if claims.Type != TokenTypeAccess {
		return nil, fmt.Errorf("not an access token")
	}
	if claims.UserID == "" {
		return nil, fmt.Errorf("missing user_id")
	}
	return claims, nil
}

func ParseRefresh(tokenString, secret string) (*RefreshClaims, error) {
	claims := &RefreshClaims{}
	if err := parse(tokenString, secret, claims); err != nil {
		return nil, err
	}
	if claims.Type != TokenTypeRefresh {
		return nil, fmt.Errorf("not a refresh token")
	}
	if claims.UserID == "" || claims.FamilyID == "" {
		return nil, fmt.Errorf("missing user_id or family_id")
	}
	return claims, nil
}

// parse verifies signature, HS256 and expiry (exp is required).
func parse(tokenString, secret string, claims jwt.Claims) error {
	_, err := jwt.ParseWithClaims(
		tokenString,
		claims,
		func(*jwt.Token) (any, error) { return []byte(secret), nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
	)
	return err
}
