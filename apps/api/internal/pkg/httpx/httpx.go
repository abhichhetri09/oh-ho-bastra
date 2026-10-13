// Package httpx holds the small request/response helpers every handler
// shares, so path IDs, pagination and failures look the same on all routes.
package httpx

import (
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/rlog"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
)

// Fail writes an error response.
func Fail(c *gin.Context, status int, code, message string) {
	c.JSON(status, types.APIResponse{
		Success: false,
		Message: message,
		Code:    code,
	})
}

// Internal logs err and writes the generic 500 response, so internals
// never leak to the client.
func Internal(c *gin.Context, msg string, err error, args ...any) {
	rlog.Error(c, msg, err, args...)
	Fail(c, http.StatusInternalServerError, constants.InternalServerError, "Failed to process request")
}

// PathUUID parses the path parameter param as a UUID. On failure it writes a
// 400 with code and the message "Invalid <label>" and returns false.
func PathUUID(c *gin.Context, param, code, label string) (pgtype.UUID, bool) {
	id, err := utils.ConvertToUUID(c.Param(param))
	if err != nil {
		rlog.Warn(c, "invalid path id", "param", param, "value", c.Param(param))
		Fail(c, http.StatusBadRequest, code, "Invalid "+label)
		return id, false
	}
	return id, true
}

// UserID reads the authenticated user's id that RequireAuth stored. A missing
// or malformed id is a server bug (the token was already verified), so it is
// a 500, not a client error.
func UserID(c *gin.Context) (pgtype.UUID, bool) {
	id, err := utils.ConvertToUUID(c.GetString(constants.UserIDKey))
	if err != nil {
		Internal(c, "invalid user id in context", err)
		return id, false
	}
	return id, true
}

// MaxPage bounds the page query parameter so offsets stay within int32.
const MaxPage = 100_000

// ParsePage reads the optional page query parameter (default 1).
// On failure it writes a 400 and returns false.
func ParsePage(c *gin.Context) (int, bool) {
	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil || page < 1 || page > MaxPage {
		failPage(c)
		return 0, false
	}
	return page, true
}

// CheckPageInRange rejects a page past the last one. An empty result still
// has page 1, so clients can always request the first page.
func CheckPageInRange(c *gin.Context, page int, total, limit int64) bool {
	if int64(page) > max((total+limit-1)/limit, 1) {
		failPage(c)
		return false
	}
	return true
}

// Offset is the row offset of page for a page size of limit.
func Offset(page int, limit int64) int32 {
	return int32(int64(page-1) * limit)
}

func failPage(c *gin.Context) {
	Fail(c, http.StatusBadRequest, constants.InvalidPageParam, "Invalid page parameter")
}

// Sort is a list's order: one of its sortable fields and a direction.
type Sort struct{ Field, Dir string }

// ParseSort reads the optional sort and dir query parameters. sort must be
// one of fields (fallback when absent); dir is asc or desc, defaulting to
// the field's natural direction in fields. On failure it writes a 400.
func ParseSort(c *gin.Context, fields map[string]string, fallback string) (Sort, bool) {
	field := c.DefaultQuery("sort", fallback)
	natural, known := fields[field]
	if !known {
		names := make([]string, 0, len(fields))
		for f := range fields {
			names = append(names, f)
		}
		slices.Sort(names)
		Fail(c, http.StatusBadRequest, constants.InvalidQueryParam, "sort must be one of "+strings.Join(names, ", "))
		return Sort{}, false
	}
	dir := c.DefaultQuery("dir", natural)
	if dir != "asc" && dir != "desc" {
		Fail(c, http.StatusBadRequest, constants.InvalidQueryParam, "dir must be asc or desc")
		return Sort{}, false
	}
	return Sort{Field: field, Dir: dir}, true
}
