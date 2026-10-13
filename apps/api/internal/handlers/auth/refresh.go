package auth

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	session "github.com/suprimkhatri77/cartspace/backend/internal/auth"
	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/rlog"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
)

// Refresh rotates the session's refresh token (compare-and-swap), gives a
// request that lost a concurrent rotation an access token within the grace
// window, and revokes the session when an old token is replayed.
func Refresh(queries repository.AuthRepository, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		token, err := c.Cookie(session.RefreshCookie)
		if err != nil || token == "" {
			rlog.Warn(c, "missing refresh token")
			unauthorized(c, cfg, "Missing refresh token", constants.MissingRefreshToken)
			return
		}

		claims, err := session.ParseRefresh(token, cfg.JWTRefreshSecret)
		if err != nil {
			rlog.Warn(c, "invalid refresh token", "error", err)
			unauthorized(c, cfg, "Invalid refresh token", constants.InvalidRefreshToken)
			return
		}

		familyID, err := utils.ConvertToUUID(claims.FamilyID)
		if err != nil {
			rlog.Warn(c, "invalid family id in refresh token", "error", err)
			unauthorized(c, cfg, "Invalid refresh token", constants.InvalidRefreshToken)
			return
		}

		sess, err := queries.GetActiveSessionByID(ctx, familyID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				rlog.Warn(c, "session not found, expired or revoked", "family_id", claims.FamilyID)
				unauthorized(c, cfg, "Session expired, please log in again", constants.InvalidRefreshToken)
				return
			}
			// a db outage must not log the user out: keep the cookies
			rlog.Error(c, "failed to fetch session", err, "family_id", claims.FamilyID)
			internalError(c)
			return
		}

		if uuid.UUID(sess.UserID.Bytes).String() != claims.UserID {
			rlog.Warn(c, "refresh token user does not match session", "family_id", claims.FamilyID)
			unauthorized(c, cfg, "Invalid refresh token", constants.InvalidRefreshToken)
			return
		}

		user, err := queries.GetUserByID(ctx, sess.UserID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				unauthorized(c, cfg, "Session expired, please log in again", constants.InvalidRefreshToken)
				return
			}
			rlog.Error(c, "failed to fetch user", err, "user_id", sess.UserID)
			internalError(c)
			return
		}

		presented := session.HashRefreshToken(token)
		now := time.Now()

		switch session.Decide(sess, presented, now, cfg.RefreshReuseWindow) {
		case session.Rotate:
			rotate(c, queries, cfg, sess, user, presented, now)
		case session.Grace:
			grace(c, cfg, user)
		case session.Reuse:
			rlog.Warn(c, "refresh token reuse detected, revoking session", "family_id", claims.FamilyID, "user_id", user.ID)
			if err := queries.RevokeSession(ctx, sess.ID); err != nil {
				rlog.Error(c, "failed to revoke session", err, "family_id", claims.FamilyID)
			}
			unauthorized(c, cfg, "Session invalid, please log in again", constants.InvalidRefreshToken)
		}
	}
}

func rotate(c *gin.Context, queries repository.AuthRepository, cfg *config.Config, sess db.Session, user db.User, presented string, now time.Time) {
	ctx := c.Request.Context()
	expiresAt := session.NextExpiry(sess.CreatedAt.Time, now, cfg.RefreshTokenTTL, cfg.MaxSessionAge)

	tokens, err := session.NewTokens(cfg, user, sess.ID, expiresAt)
	if err != nil {
		rlog.Error(c, "failed to sign tokens", err, "user_id", user.ID)
		internalError(c)
		return
	}

	_, err = queries.RotateSessionToken(ctx, db.RotateSessionTokenParams{
		ID:                sess.ID,
		NewTokenHash:      session.HashRefreshToken(tokens.RefreshToken),
		ExpectedTokenHash: presented,
		ExpiresAt:         pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			rlog.Error(c, "failed to rotate session token", err, "user_id", user.ID)
			internalError(c)
			return
		}

		// Lost the compare-and-swap: a concurrent request rotated this token
		// first. Our token is now the previous one, so serve the grace path.
		reloaded, err := queries.GetActiveSessionByID(ctx, sess.ID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				unauthorized(c, cfg, "Session expired, please log in again", constants.InvalidRefreshToken)
				return
			}
			rlog.Error(c, "failed to reload session after lost rotation", err, "user_id", user.ID)
			internalError(c)
			return
		}
		if session.WithinGrace(reloaded, presented, time.Now(), cfg.RefreshReuseWindow) {
			grace(c, cfg, user)
			return
		}
		rlog.Warn(c, "lost rotation race outside the grace window", "user_id", user.ID)
		unauthorized(c, cfg, "Session invalid, please log in again", constants.InvalidRefreshToken)
		return
	}

	session.SetSessionCookies(c, cfg, tokens, expiresAt)
	rlog.Info(c, "refresh token rotated", "user_id", user.ID)
	c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Tokens refreshed"})
}

func grace(c *gin.Context, cfg *config.Config, user db.User) {
	accessToken, err := session.NewAccessToken(cfg, user)
	if err != nil {
		rlog.Error(c, "failed to sign access token", err, "user_id", user.ID)
		internalError(c)
		return
	}
	session.SetAccessCookie(c, cfg, accessToken)
	rlog.Info(c, "refresh within grace window, issued access token only", "user_id", user.ID)
	c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Tokens refreshed"})
}

// unauthorized clears the session cookies and responds 401.
func unauthorized(c *gin.Context, cfg *config.Config, message, code string) {
	session.ClearSessionCookies(c, cfg)
	c.JSON(http.StatusUnauthorized, types.APIResponse{Success: false, Message: message, Code: code})
}
