package auth

import (
	"errors"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	session "github.com/suprimkhatri77/cartspace/backend/internal/auth"
	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/rlog"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

// dummyHash is compared against when the email doesn't exist, so a login for
// an unknown email takes as long as a wrong password and doesn't reveal
// which emails are registered.
var dummyHash = sync.OnceValue(func() []byte {
	h, err := bcrypt.GenerateFromPassword([]byte("dummy-password-for-timing"), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
	return h
})

func Login(queries repository.AuthRepository, cfg *config.Config) gin.HandlerFunc {
	dummyHash() // compute now, so the first unknown-email login isn't slower
	return func(c *gin.Context) {
		req, ok := validator.BindJSON[types.LoginRequest](c)
		if !ok {
			return
		}
		email := session.NormalizeEmail(req.Email)

		user, err := queries.GetUserByEmail(c.Request.Context(), email)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				_ = bcrypt.CompareHashAndPassword(dummyHash(), []byte(req.Password))
				rlog.Warn(c, "invalid credentials (unknown email)")
				invalidCredentials(c)
				return
			}
			rlog.Error(c, "failed to fetch user", err)
			internalError(c)
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
			rlog.Warn(c, "invalid credentials (wrong password)", "user_id", user.ID)
			invalidCredentials(c)
			return
		}

		if err := session.IssueSession(c, queries, cfg, user); err != nil {
			rlog.Error(c, "failed to issue session", err, "user_id", user.ID)
			internalError(c)
			return
		}

		rlog.Info(c, "user logged in", "user_id", user.ID)
		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Logged in successfully",
			Data:    session.NewPublicUser(user),
		})
	}
}

func invalidCredentials(c *gin.Context) {
	c.JSON(http.StatusUnauthorized, types.APIResponse{
		Success: false,
		Message: "Invalid credentials",
		Code:    constants.InvalidCredentials,
	})
}

func internalError(c *gin.Context) {
	c.JSON(http.StatusInternalServerError, types.APIResponse{
		Success: false,
		Message: "Failed to process request",
		Code:    constants.InternalServerError,
	})
}
