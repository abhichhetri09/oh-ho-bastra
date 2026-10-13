package utils

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func ConvertToUUID(id string) (pgtype.UUID, error) {
	var ID pgtype.UUID
	if err := ID.Scan(id); err != nil {
		return ID, fmt.Errorf("invalid uuid: %w", err)
	}

	return ID, nil
}

// UUIDToString formats a UUID ("" when it is NULL).
func UUIDToString(id pgtype.UUID) string {
	if !id.Valid {
		return ""
	}
	return uuid.UUID(id.Bytes).String()
}
