package auth

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"

	session "github.com/suprimkhatri77/cartspace/backend/internal/auth"
	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/rlog"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

func Register(queries repository.AuthRepository, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		req, ok := validator.BindJSON[types.RegisterRequest](c)
		if !ok {
			return
		}
		email := session.NormalizeEmail(req.Email)

		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if errors.Is(err, bcrypt.ErrPasswordTooLong) {
			// max=72 counts characters; bcrypt's limit is 72 bytes (multibyte chars)
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

		user, err := queries.CreateUser(c.Request.Context(), db.CreateUserParams{
			Name:         req.Name,
			Email:        email,
			PasswordHash: string(hash),
			Role:         constants.RoleCustomer,
		})
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) {
				switch pgErr.Code {
				case "23505": // unique_violation
					rlog.Warn(c, "user already exists")
					c.JSON(http.StatusConflict, types.APIResponse{
						Success: false,
						Message: "User already exists",
						Code:    constants.UserAlreadyExists,
					})
					return
				case "23514": // check_violation: email = lower(email) fails for some unicode
					rlog.Warn(c, "email rejected by db check", "constraint", pgErr.ConstraintName)
					c.JSON(http.StatusBadRequest, types.APIResponse{
						Success: false,
						Message: "Enter a valid email address",
						Code:    constants.ValidationFailed,
						Errors:  []types.AppError{{Code: constants.FieldInvalidEmail, Field: "email", Message: "Enter a valid email address"}},
					})
					return
				}
			}
			rlog.Error(c, "failed to create user", err)
			internalError(c)
			return
		}

		if err := session.IssueSession(c, queries, cfg, user); err != nil {
			rlog.Error(c, "failed to issue session", err, "user_id", user.ID)
			internalError(c)
			return
		}

		rlog.Info(c, "user registered", "user_id", user.ID)
		c.JSON(http.StatusCreated, types.APIResponse{
			Success: true,
			Message: "Registration successful",
			Data:    session.NewPublicUser(user),
		})
	}
}
