package validator

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"regexp"
	"strings"
	"unicode"

	"github.com/go-playground/validator/v10"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

func Parse(err error, obj any) []types.AppError {
	var typeErr *json.UnmarshalTypeError
	if errors.As(err, &typeErr) {
		field := stripIndex(typeErr.Field)
		label := humanize(field)
		if label == "" {
			label = "Request body"
		}
		return []types.AppError{
			{
				Code:    constants.FieldInvalidType,
				Field:   field,
				Message: fmt.Sprintf("%s must be %s", label, jsonKindName(typeErr.Type)),
			},
		}
	}

	var ve validator.ValidationErrors

	if !errors.As(err, &ve) {
		return []types.AppError{
			{
				Code:    constants.InvalidRequestBody,
				Message: "Invalid request body",
			},
		}
	}

	errs := make([]types.AppError, 0, len(ve))

	for _, fe := range ve {
		field, path := resolveField(reflect.TypeOf(obj), fe.StructNamespace())
		if path == "" {
			path = strings.ToLower(fe.Field())
		}
		label := fieldLabel(field, path)

		errs = append(errs, types.AppError{
			Code:    mapTagToCode(fe),
			Field:   path,
			Message: messageFor(fe, field, label),
		})
	}

	return errs
}

func messageFor(fe validator.FieldError, field *reflect.StructField, label string) string {
	if field != nil {
		// Per-rule override: msg_required, msg_min, msg_email, ...
		if override := strings.TrimSpace(field.Tag.Get("msg_" + fe.Tag())); override != "" {
			return override
		}
	}
	return buildMessage(fe, label)
}

func mapTagToCode(fe validator.FieldError) string {
	switch fe.Tag() {
	case "required", "required_if":
		return constants.FieldRequired
	case "not_blank":
		return constants.FieldBlank
	case "min":
		if isNumber(fe.Kind()) {
			return constants.FieldOutOfRange
		}
		return constants.FieldTooShort
	case "max":
		if isNumber(fe.Kind()) {
			return constants.FieldOutOfRange
		}
		return constants.FieldTooLong
	case "gt", "gte", "lt", "lte", "gtfield", "ltfield":
		return constants.FieldOutOfRange
	case "email":
		return constants.FieldInvalidEmail
	case "uuid":
		return constants.FieldInvalidUUID
	case "url":
		return constants.FieldInvalidURL
	case "personname", "alphanum":
		return constants.FieldInvalidFormat
	case "oneof":
		return constants.FieldInvalidValue
	case "date_format":
		return constants.FieldInvalidDate
	case "unique":
		return constants.FieldDuplicate
	case "samelen":
		return constants.FieldLengthMismatch
	default:
		return constants.FieldInvalid
	}
}

func buildMessage(fe validator.FieldError, label string) string {
	switch fe.Tag() {
	case "required":
		return fmt.Sprintf("%s is required", label)
	case "min":
		switch {
		case isCollection(fe.Kind()):
			return fmt.Sprintf("%s must have at least %s item(s)", label, fe.Param())
		case isNumber(fe.Kind()):
			return fmt.Sprintf("%s must be at least %s", label, fe.Param())
		}
		return fmt.Sprintf("%s must be at least %s characters", label, fe.Param())
	case "max":
		switch {
		case isCollection(fe.Kind()):
			return fmt.Sprintf("%s cannot have more than %s item(s)", label, fe.Param())
		case isNumber(fe.Kind()):
			return fmt.Sprintf("%s must be at most %s", label, fe.Param())
		}
		return fmt.Sprintf("%s cannot exceed %s characters", label, fe.Param())
	case "email":
		return fmt.Sprintf("Enter a valid %s", strings.ToLower(label))
	case "uuid":
		return fmt.Sprintf("%s must be a valid ID", label)
	case "url":
		return fmt.Sprintf("%s must be a valid URL", label)
	case "personname":
		return fmt.Sprintf("%s can only contain letters, spaces, apostrophes and hyphens", label)
	case "gt":
		return fmt.Sprintf("%s must be greater than %s", label, fe.Param())
	case "gte":
		return fmt.Sprintf("%s must be at least %s", label, fe.Param())
	case "lt":
		return fmt.Sprintf("%s must be less than %s", label, fe.Param())
	case "lte":
		return fmt.Sprintf("%s must be at most %s", label, fe.Param())
	case "oneof":
		return fmt.Sprintf("%s must be one of: %s", label, strings.ReplaceAll(fe.Param(), " ", ", "))
	case "boolean":
		return fmt.Sprintf("%s must be true or false", label)
	case "numeric":
		return fmt.Sprintf("%s must be a number", label)
	case "alphanum":
		return fmt.Sprintf("%s can only contain letters and numbers", label)
	case "unique":
		return fmt.Sprintf("%s must not contain duplicates", label)
	case "samelen":
		return fmt.Sprintf("%s must have one entry per %s", label, humanize(toSnake(fe.Param())))
	case "ltfield":
		return fmt.Sprintf("%s must be less than %s", label, humanize(toSnake(fe.Param())))
	case "gtfield":
		return fmt.Sprintf("%s must be greater than %s", label, humanize(toSnake(fe.Param())))
	case "required_if":
		return fmt.Sprintf("%s is required", label)
	case "not_blank":
		return fmt.Sprintf("%s cannot be blank", label)
	case "date_format":
		return fmt.Sprintf("%s must be a valid date (YYYY-MM-DD)", label)
	default:
		return fmt.Sprintf("%s is invalid", label)
	}
}

// resolveField walks a validator struct namespace such as
// "CreateVariant.Properties[0].Name" through the request type and returns the
// failing struct field plus its JSON path in react-hook-form style
// ("properties.0.name", "images.2").
func resolveField(t reflect.Type, structNamespace string) (*reflect.StructField, string) {
	segments := strings.Split(structNamespace, ".")
	if len(segments) < 2 || t == nil {
		return nil, ""
	}

	var (
		field *reflect.StructField
		path  []string
	)
	for _, seg := range segments[1:] { // segments[0] is the root type name
		name, index := splitIndex(seg)

		t = deref(t)
		if t.Kind() != reflect.Struct {
			return nil, ""
		}
		f, ok := t.FieldByName(name)
		if !ok {
			return nil, ""
		}
		field = &f
		path = append(path, jsonFieldName(f))

		t = f.Type
		if index != "" {
			path = append(path, index)
			if t = deref(t); t.Kind() == reflect.Slice || t.Kind() == reflect.Array || t.Kind() == reflect.Map {
				t = t.Elem()
			}
		}
	}
	return field, strings.Join(path, ".")
}

func jsonFieldName(f reflect.StructField) string {
	if tag := f.Tag.Get("json"); tag != "" {
		if name := strings.Split(tag, ",")[0]; name != "" && name != "-" {
			return name
		}
	}
	return toSnake(f.Name)
}

// splitIndex splits "Images[2]" into ("Images", "2").
func splitIndex(seg string) (string, string) {
	open := strings.Index(seg, "[")
	if open == -1 || !strings.HasSuffix(seg, "]") {
		return seg, ""
	}
	return seg[:open], seg[open+1 : len(seg)-1]
}

func deref(t reflect.Type) reflect.Type {
	for t.Kind() == reflect.Ptr {
		t = t.Elem()
	}
	return t
}

func isNumber(k reflect.Kind) bool {
	switch k {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return true
	}
	return false
}

func isCollection(k reflect.Kind) bool {
	return k == reflect.Slice || k == reflect.Array || k == reflect.Map
}

// pluralAcronym matches a plural initialism such as "IDs" or "URLs".
var pluralAcronym = regexp.MustCompile(`[A-Z]{2,}s(?:[A-Z]|$)`)

// toSnake turns a Go field name like "ImagePublicIDs" into "image_public_ids".
func toSnake(name string) string {
	// "IDs" -> "Ids" so the plural s stays attached to its initialism
	name = pluralAcronym.ReplaceAllStringFunc(name, func(m string) string {
		next := ""
		if last := m[len(m)-1]; last != 's' {
			m, next = m[:len(m)-1], string(last) // keep the next word's capital
		}
		return m[:1] + strings.ToLower(m[1:]) + next
	})
	runes := []rune(name)
	var b strings.Builder
	for i, r := range runes {
		if unicode.IsUpper(r) {
			prevLower := i > 0 && !unicode.IsUpper(runes[i-1])
			nextLower := i+1 < len(runes) && unicode.IsLower(runes[i+1])
			if i > 0 && (prevLower || (nextLower && unicode.IsUpper(runes[i-1]))) {
				b.WriteByte('_')
			}
			r = unicode.ToLower(r)
		}
		b.WriteRune(r)
	}
	return b.String()
}

func fieldLabel(field *reflect.StructField, path string) string {
	if field != nil {
		if label := strings.TrimSpace(field.Tag.Get("label")); label != "" {
			return label
		}
		return humanize(jsonFieldName(*field))
	}
	return humanize(path)
}

func humanize(name string) string {
	name = strings.ReplaceAll(name, "_", " ")
	name = strings.TrimSpace(name)
	if name == "" {
		return name
	}

	runes := []rune(name)
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}

func stripIndex(name string) string {
	if idx := strings.Index(name, "["); idx != -1 {
		return name[:idx]
	}
	return name
}

// jsonKindName describes the JSON type a Go field expects, for type errors.
func jsonKindName(t reflect.Type) string {
	for t.Kind() == reflect.Ptr {
		t = t.Elem()
	}
	switch t.Kind() {
	case reflect.String:
		return "a string"
	case reflect.Bool:
		return "true or false"
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return "a whole number"
	case reflect.Float32, reflect.Float64:
		return "a number"
	case reflect.Slice, reflect.Array:
		return "a list"
	default:
		return "an object"
	}
}
