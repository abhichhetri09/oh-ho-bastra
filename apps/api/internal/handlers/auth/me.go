package auth

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	session "github.com/suprimkhatri77/cartspace/backend/internal/auth"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/rlog"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
)

// Me returns the authenticated user (fresh from the db, not the token claims).
func Me(queries repository.AuthRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := utils.ConvertToUUID(c.GetString(constants.UserIDKey))
		if err != nil {
			rlog.Error(c, "invalid user id in context", err)
			internalError(c)
			return
		}

		user, err := queries.GetUserByID(c.Request.Context(), userID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.JSON(http.StatusNotFound, types.APIResponse{
					Success: false,
					Message: "User not found",
					Code:    constants.UserNotFound,
				})
				return
			}
			rlog.Error(c, "failed to fetch user", err, "user_id", userID)
			internalError(c)
			return
		}

		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "User fetched", Data: session.NewPublicUser(user)})
	}
}
