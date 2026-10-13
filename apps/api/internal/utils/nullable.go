package utils

import "github.com/jackc/pgx/v5/pgtype"

// ToNullableText maps "" to SQL NULL.
func ToNullableText(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}
