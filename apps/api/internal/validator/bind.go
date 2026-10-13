package validator

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/rlog"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
)

// BindJSON decodes the request body into T, trims its string fields (except
// those tagged `trim:"-"`) and then validates it, so rules like min=2 see the
// value that will actually be stored.
// On failure it writes a 400 response and returns (nil, false).
func BindJSON[T any](c *gin.Context) (*T, bool) {
	var body T
	if err := decodeTrimValidate(c, &body); err != nil {
		rlog.Warn(c, "invalid request payload", "error", err)

		c.JSON(http.StatusBadRequest, types.APIResponse{
			Success: false,
			Message: "Invalid request body",
			Code:    constants.ValidationFailed,
			Errors:  Parse(err, body),
		})
		return nil, false
	}

	return &body, true
}

func decodeTrimValidate(c *gin.Context, body any) error {
	if c.Request.Body == nil {
		return errors.New("empty request body")
	}
	if err := json.NewDecoder(c.Request.Body).Decode(body); err != nil {
		return err
	}
	utils.TrimStruct(body)
	return binding.Validator.ValidateStruct(body)
}
