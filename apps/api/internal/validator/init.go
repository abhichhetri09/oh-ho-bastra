package validator

import (
	"reflect"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
)

var (
	once sync.Once

	// A person's name in any script: a letter first, then letters, combining
	// marks, spaces, apostrophes, periods and hyphens (José, O'Brien,
	// Mary-Jane, J. R.). Not tabs or newlines.
	personNameRe = regexp.MustCompile(`^\p{L}[\p{L}\p{M} '’.-]*$`)

	// A UUID in its canonical 8-4-4-4-12 form, in either case (RFC 9562:
	// the hex digits are case-insensitive on input).
	uuidRe = regexp.MustCompile(`^(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
)

func Init() {
	once.Do(func() {
		v, ok := binding.Validator.Engine().(*validator.Validate)
		if !ok {
			return
		}

		_ = v.RegisterValidation("personname", func(fl validator.FieldLevel) bool {
			return personNameRe.MatchString(fl.Field().String())
		})

		// Replaces the built-in "uuid", whose pattern is lowercase only: an
		// uppercase id from a client was refused although the path
		// parameters (uuid.Parse) accept it.
		_ = v.RegisterValidation("uuid", func(fl validator.FieldLevel) bool {
			return uuidRe.MatchString(fl.Field().String())
		})

		_ = v.RegisterValidation("date_format", func(fl validator.FieldLevel) bool {
			_, err := time.Parse("2006-01-02", fl.Field().String())
			return err == nil
		})

		_ = v.RegisterValidation("not_blank", func(fl validator.FieldLevel) bool {
			return strings.TrimSpace(fl.Field().String()) != ""
		})

		// samelen=Other: this slice has as many items as the sibling field Other
		// (e.g. one Cloudinary public ID per image URL).
		_ = v.RegisterValidation("samelen", func(fl validator.FieldLevel) bool {
			other := reflect.Indirect(fl.Parent()).FieldByName(fl.Param())
			if !other.IsValid() || other.Kind() != reflect.Slice || fl.Field().Kind() != reflect.Slice {
				return false
			}
			return fl.Field().Len() == other.Len()
		})
	})
}
