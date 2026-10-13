package auth

import (
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
)

const (
	AccessCookie   = "access_token"
	RefreshCookie  = "refresh_token"
	LoggedInCookie = "is_logged_in" // readable by JS/middleware; carries no secret
)

// RefreshDecision is what to do with a presented refresh token.
type RefreshDecision int

const (
	// Rotate: the token is the session's current one; issue a new pair.
	Rotate RefreshDecision = iota
	// Grace: the token was rotated moments ago by a concurrent request (another
	// tab, or the web proxy); issue only a new access token.
	Grace
	// Reuse: an old or unknown token; treat as theft and revoke the session.
	Reuse
)

// Decide classifies a presented refresh token hash against its session.
func Decide(sess db.Session, presentedHash string, now time.Time, reuseWindow time.Duration) RefreshDecision {
	if presentedHash == sess.CurrentTokenHash {
		return Rotate
	}
	if WithinGrace(sess, presentedHash, now, reuseWindow) {
		return Grace
	}
	return Reuse
}

// WithinGrace reports whether presentedHash is the session's previous token
// and it was rotated less than reuseWindow ago.
func WithinGrace(sess db.Session, presentedHash string, now time.Time, reuseWindow time.Duration) bool {
	return sess.PreviousTokenHash.Valid &&
		presentedHash == sess.PreviousTokenHash.String &&
		sess.PreviousRotatedAt.Valid &&
		now.Sub(sess.PreviousRotatedAt.Time) < reuseWindow
}

// NextExpiry slides the session by the refresh TTL but never past
// createdAt + maxAge, so an active session still ends eventually.
func NextExpiry(createdAt, now time.Time, ttl, maxAge time.Duration) time.Time {
	next := now.Add(ttl)
	if limit := createdAt.Add(maxAge); next.After(limit) {
		return limit
	}
	return next
}

// IssueSession creates a session row for a fresh login and sets the cookies.
func IssueSession(c *gin.Context, queries repository.AuthRepository, cfg *config.Config, user db.User) error {
	familyID := pgtype.UUID{Bytes: uuid.New(), Valid: true}
	now := time.Now()
	expiresAt := NextExpiry(now, now, cfg.RefreshTokenTTL, cfg.MaxSessionAge)

	tokens, err := NewTokens(cfg, user, familyID, expiresAt)
	if err != nil {
		return err
	}

	_, err = queries.CreateSession(c.Request.Context(), db.CreateSessionParams{
		ID:               familyID,
		UserID:           user.ID,
		CurrentTokenHash: HashRefreshToken(tokens.RefreshToken),
		UserAgent:        utils.ToNullableText(truncate(c.Request.UserAgent(), maxUserAgentLen)),
		IpAddress:        utils.ToNullableText(c.ClientIP()),
		ExpiresAt:        pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		return err
	}

	SetSessionCookies(c, cfg, tokens, expiresAt)
	return nil
}

// SetSessionCookies sets the access and refresh cookies; the refresh cookie
// lives exactly as long as the session row.
func SetSessionCookies(c *gin.Context, cfg *config.Config, tokens *Tokens, refreshExpiresAt time.Time) {
	refreshMaxAge := int(time.Until(refreshExpiresAt).Seconds())
	SetAccessCookie(c, cfg, tokens.AccessToken)
	utils.SetAuthCookie(c, RefreshCookie, tokens.RefreshToken, refreshMaxAge, cfg)
	utils.SetPublicCookie(c, LoggedInCookie, "true", refreshMaxAge, cfg)
}

func SetAccessCookie(c *gin.Context, cfg *config.Config, accessToken string) {
	utils.SetAuthCookie(c, AccessCookie, accessToken, int(cfg.AccessTokenTTL.Seconds()), cfg)
}

func ClearSessionCookies(c *gin.Context, cfg *config.Config) {
	utils.SetAuthCookie(c, AccessCookie, "", -1, cfg)
	utils.SetAuthCookie(c, RefreshCookie, "", -1, cfg)
	utils.SetPublicCookie(c, LoggedInCookie, "", -1, cfg)
}

// NormalizeEmail trims and lowercases, so one address maps to one account
// (the users table enforces email = lower(email)).
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// PublicUser is the user shape returned by auth endpoints.
type PublicUser struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Email    string  `json:"email"`
	Role     string  `json:"role"`
	ImageURL *string `json:"image_url"`
}

func NewPublicUser(user db.User) PublicUser {
	pu := PublicUser{
		ID:    uuid.UUID(user.ID.Bytes).String(),
		Name:  user.Name,
		Email: user.Email,
		Role:  user.Role,
	}
	if user.ImageUrl.Valid {
		pu.ImageURL = &user.ImageUrl.String
	}
	return pu
}

// maxUserAgentLen bounds what a client can make us store per session.
const maxUserAgentLen = 512

// truncate cuts s to at most n bytes without splitting a UTF-8 character.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	return s[:n]
}
