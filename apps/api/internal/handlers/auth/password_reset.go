package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	session "github.com/suprimkhatri77/cartspace/backend/internal/auth"
	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/emails"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/rlog"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

const (
	// resetLinkLife is how long an emailed link works (the email says an hour).
	resetLinkLife = time.Hour
	// resetSendTimeout bounds the lookup and SMTP send behind one request.
	resetSendTimeout = 45 * time.Second
)

// ForgotPassword emails a link to choose a new password. It answers the
// same 202 whether or not the email has an account, and does the work
// after answering, so neither the reply nor its timing tells which emails
// are registered. An account gets at most one email a minute.
func ForgotPassword(queries *db.Queries, cfg *config.Config, mailer emails.Sender) gin.HandlerFunc {
	return func(c *gin.Context) {
		req, ok := validator.BindJSON[types.ForgotPasswordRequest](c)
		if !ok {
			return
		}
		if mailer == nil || cfg.FrontendURL == "" {
			rlog.Warn(c, "password reset asked for, but mail or FRONTEND_URL is not set up")
			httpx.Fail(c, http.StatusServiceUnavailable, constants.MailUnavailable,
				"Password reset emails aren't available right now. Try again later.")
			return
		}

		email := session.NormalizeEmail(req.Email)
		log := slog.With("request_id", c.GetString(constants.RequestIDKey))
		// Detached from the request, which ends with the reply below.
		ctx := context.WithoutCancel(c.Request.Context())
		go sendResetLink(ctx, queries, mailer, cfg.FrontendURL, email, log)

		c.JSON(http.StatusAccepted, types.APIResponse{
			Success: true,
			Message: "If an account uses that email, a reset link is on its way",
		})
	}
}

func sendResetLink(ctx context.Context, queries *db.Queries, mailer emails.Sender, frontendURL, email string, log *slog.Logger) {
	ctx, cancel := context.WithTimeout(ctx, resetSendTimeout)
	defer cancel()

	user, err := queries.GetUserByEmail(ctx, email)
	if errors.Is(err, pgx.ErrNoRows) {
		log.Info("password reset for an email without an account")
		return
	}
	if err != nil {
		log.Error("password reset: fetch user", "err", err)
		return
	}

	token, hash, err := newResetToken()
	if err != nil {
		log.Error("password reset: make token", "err", err)
		return
	}
	id, err := queries.CreatePasswordReset(ctx, db.CreatePasswordResetParams{
		UserID:    user.ID,
		TokenHash: hash,
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(resetLinkLife), Valid: true},
	})
	if errors.Is(err, pgx.ErrNoRows) {
		log.Info("password reset throttled: one email a minute", "user_id", utils.UUIDToString(user.ID))
		return
	}
	if err != nil {
		log.Error("password reset: save token", "err", err, "user_id", utils.UUIDToString(user.ID))
		return
	}
	// Only the newest link works; a failure here leaves older ones valid
	// until they expire, which is no worse than before.
	if err := queries.VoidOtherPasswordResets(ctx, db.VoidOtherPasswordResetsParams{UserID: user.ID, ID: id}); err != nil {
		log.Error("password reset: void older links", "err", err, "user_id", utils.UUIDToString(user.ID))
	}

	msg, err := emails.RenderPasswordReset(user.Name, token, frontendURL)
	if err != nil {
		log.Error("password reset: render email", "err", err)
		return
	}
	if err := mailer.Send(ctx, emails.Message{To: user.Email, Subject: msg.Subject, HTML: msg.HTML, Text: msg.Text}); err != nil {
		log.Error("password reset: send email", "err", err, "user_id", utils.UUIDToString(user.ID))
		return
	}
	log.Info("password reset email sent", "user_id", utils.UUIDToString(user.ID))
}

// ResetPassword sets a new password from an emailed link. The link works
// once; the change signs the account out everywhere, all in one
// transaction, so a stolen session can't outlive it.
func ResetPassword(pool *pgxpool.Pool, queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		req, ok := validator.BindJSON[types.ResetPasswordRequest](c)
		if !ok {
			return
		}
		ctx := c.Request.Context()

		// Before the transaction: bcrypt is slow, and the row lock isn't needed for it.
		passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if errors.Is(err, bcrypt.ErrPasswordTooLong) {
			c.JSON(http.StatusBadRequest, types.APIResponse{
				Success: false,
				Message: "Invalid request body",
				Code:    constants.ValidationFailed,
				Errors:  []types.AppError{{Code: constants.FieldTooLong, Field: "password", Message: "Password is too long"}},
			})
			return
		}
		if err != nil {
			rlog.Error(c, "failed to hash password", err)
			internalError(c)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			rlog.Error(c, "password reset: begin", err)
			internalError(c)
			return
		}
		defer func() { _ = tx.Rollback(ctx) }()
		qtx := queries.WithTx(tx)

		userID, err := qtx.ConsumePasswordReset(ctx, hashResetToken(req.Token))
		if errors.Is(err, pgx.ErrNoRows) {
			rlog.Warn(c, "password reset with an unknown, used or expired link")
			httpx.Fail(c, http.StatusBadRequest, constants.InvalidResetToken,
				"This reset link has expired or was already used. Ask for a new one.")
			return
		}
		if err != nil {
			rlog.Error(c, "password reset: consume link", err)
			internalError(c)
			return
		}
		if err := qtx.UpdateUserPassword(ctx, db.UpdateUserPasswordParams{ID: userID, PasswordHash: string(passwordHash)}); err != nil {
			rlog.Error(c, "password reset: update password", err, "user_id", userID)
			internalError(c)
			return
		}
		if err := qtx.RevokeAllUserSessions(ctx, userID); err != nil {
			rlog.Error(c, "password reset: revoke sessions", err, "user_id", userID)
			internalError(c)
			return
		}
		if err := tx.Commit(ctx); err != nil {
			rlog.Error(c, "password reset: commit", err, "user_id", userID)
			internalError(c)
			return
		}

		rlog.Info(c, "password reset", "user_id", userID)
		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Your password has been changed. Sign in with the new one.",
		})
	}
}

// newResetToken is 32 random bytes for the link, and the hash the table
// keeps instead.
func newResetToken() (token, hash string, err error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", "", err
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	return token, hashResetToken(token), nil
}

func hashResetToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
