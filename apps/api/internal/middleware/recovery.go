package middleware

import (
	"fmt"
	"net/http"
	"runtime/debug"

	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/rlog"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

// Recovery recovers from panics, logs them with the stack and request
// context, and responds with 500.
func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if rec := recover(); rec != nil {
				rlog.Error(c, "panic recovered", fmt.Errorf("%v", rec), "stack", string(debug.Stack()))
				c.AbortWithStatusJSON(http.StatusInternalServerError, types.APIResponse{
					Success: false,
					Message: "Failed to process request",
					Code:    constants.InternalServerError,
				})
			}
		}()
		c.Next()
	}
}
