package constants

// Codes of the per-field items in a VALIDATION_FAILED response's `errors`.
// The OpenAPI spec's ValidationCode enum must list exactly these.
const (
	FieldRequired       = "REQUIRED_FIELD"
	FieldBlank          = "BLANK_FIELD"
	FieldTooShort       = "TOO_SHORT"
	FieldTooLong        = "TOO_LONG"
	FieldOutOfRange     = "OUT_OF_RANGE"
	FieldInvalidEmail   = "INVALID_EMAIL"
	FieldInvalidUUID    = "INVALID_UUID"
	FieldInvalidURL     = "INVALID_URL"
	FieldInvalidFormat  = "INVALID_FORMAT"
	FieldInvalidValue   = "INVALID_VALUE"
	FieldInvalidType    = "INVALID_TYPE"
	FieldInvalidDate    = "INVALID_DATE"
	FieldDuplicate      = "DUPLICATE_ITEM"
	FieldLengthMismatch = "LENGTH_MISMATCH"
	FieldInvalid        = "VALIDATION_ERROR"
	InvalidRequestBody  = "INVALID_REQUEST"
)
