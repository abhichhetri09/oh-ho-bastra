package auth

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	session "github.com/suprimkhatri77/cartspace/backend/internal/auth"
	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/rlog"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

// UpdateProfile changes the signed-in user's name. The access token
// carries the name (pages render it from there), so a fresh one is set
// with the new name instead of waiting for the next refresh.
func UpdateProfile(queries *db.Queries, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		req, ok := validator.BindJSON[types.UpdateProfileRequest](c)
		if !ok {
			return
		}
		userID, err := utils.ConvertToUUID(c.GetString(constants.UserIDKey))
		if err != nil {
			rlog.Error(c, "invalid user id in context", err)
			internalError(c)
			return
		}

		user, err := queries.UpdateUserName(c.Request.Context(), db.UpdateUserNameParams{ID: userID, Name: req.Name})
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, types.APIResponse{Success: false, Message: "User not found", Code: constants.UserNotFound})
			return
		}
		if err != nil {
			rlog.Error(c, "failed to update name", err, "user_id", userID)
			internalError(c)
			return
		}

		access, err := session.NewAccessToken(cfg, user)
		if err != nil {
			// The name is saved; the token catches up at the next refresh.
			rlog.Error(c, "failed to re-sign access token", err, "user_id", userID)
		} else {
			session.SetAccessCookie(c, cfg, access)
		}

		rlog.Info(c, "profile updated", "user_id", userID)
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Your details are saved", Data: session.NewPublicUser(user)})
	}
}

// ChangePassword sets a new password after checking the current one, and
// signs out every other session (this one stays), in one transaction. A
// wrong current password is a field error, not a 401: the client would
// read a 401 as an expired session and try to refresh.
func ChangePassword(pool *pgxpool.Pool, queries *db.Queries, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		req, ok := validator.BindJSON[types.ChangePasswordRequest](c)
		if !ok {
			return
		}
		ctx := c.Request.Context()
		userID, err := utils.ConvertToUUID(c.GetString(constants.UserIDKey))
		if err != nil {
			rlog.Error(c, "invalid user id in context", err)
			internalError(c)
			return
		}

		user, err := queries.GetUserByID(ctx, userID)
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, types.APIResponse{Success: false, Message: "User not found", Code: constants.UserNotFound})
			return
		}
		if err != nil {
			rlog.Error(c, "failed to fetch user", err, "user_id", userID)
			internalError(c)
			return
		}
		if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)) != nil {
			rlog.Warn(c, "change password: wrong current password", "user_id", userID)
			fieldError(c, "current_password", constants.FieldInvalid, "Your current password is incorrect")
			return
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
		if errors.Is(err, bcrypt.ErrPasswordTooLong) {
			fieldError(c, "new_password", constants.FieldTooLong, "Password is too long")
			return
		}
		if err != nil {
			rlog.Error(c, "failed to hash password", err)
			internalError(c)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			rlog.Error(c, "change password: begin", err)
			internalError(c)
			return
		}
		defer func() { _ = tx.Rollback(ctx) }()
		qtx := queries.WithTx(tx)

		if err := qtx.UpdateUserPassword(ctx, db.UpdateUserPasswordParams{ID: userID, PasswordHash: string(hash)}); err != nil {
			rlog.Error(c, "change password: update", err, "user_id", userID)
			internalError(c)
			return
		}
		if err := qtx.RevokeOtherUserSessions(ctx, db.RevokeOtherUserSessionsParams{UserID: userID, KeepID: currentSessionID(c, cfg)}); err != nil {
			rlog.Error(c, "change password: revoke other sessions", err, "user_id", userID)
			internalError(c)
			return
		}
		if err := tx.Commit(ctx); err != nil {
			rlog.Error(c, "change password: commit", err, "user_id", userID)
			internalError(c)
			return
		}

		rlog.Info(c, "password changed", "user_id", userID)
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Password changed. Your other devices are signed out."})
	}
}

// currentSessionID is the session of the refresh cookie (its family id),
// or an invalid id, which no session has, when there is none: then every
// session is signed out, this one at its next refresh.
func currentSessionID(c *gin.Context, cfg *config.Config) pgtype.UUID {
	token, err := c.Cookie(session.RefreshCookie)
	if err != nil || token == "" {
		return pgtype.UUID{}
	}
	claims, err := session.ParseRefresh(token, cfg.JWTRefreshSecret)
	if err != nil {
		return pgtype.UUID{}
	}
	id, err := utils.ConvertToUUID(claims.FamilyID)
	if err != nil {
		return pgtype.UUID{}
	}
	return id
}

func fieldError(c *gin.Context, field, code, message string) {
	c.JSON(http.StatusBadRequest, types.APIResponse{
		Success: false,
		Message: "Invalid request body",
		Code:    constants.ValidationFailed,
		Errors:  []types.AppError{{Code: code, Field: field, Message: message}},
	})
}
