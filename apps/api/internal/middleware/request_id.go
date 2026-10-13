package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
)

// maxRequestIDLen bounds a client-supplied ID so it can't bloat logs.
const maxRequestIDLen = 128

// RequestID reuses a sane incoming X-Request-ID or mints a new one, stores it
// on the context for logging and echoes it on the response.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(constants.RequestIDHeader)
		if !validRequestID(id) {
			id = uuid.NewString()
		}

		c.Set(constants.RequestIDKey, id)
		c.Writer.Header().Set(constants.RequestIDHeader, id)
		c.Next()
	}
}

// validRequestID accepts only short printable ASCII without spaces, so a
// client can't inject newlines or control characters into log lines.
func validRequestID(id string) bool {
	if id == "" || len(id) > maxRequestIDLen {
		return false
	}
	for i := 0; i < len(id); i++ {
		if id[i] <= ' ' || id[i] > '~' {
			return false
		}
	}
	return true
}
