package rlog

import (
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestNormalizeUUID(t *testing.T) {
	id := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	got := normalize([]any{"id", pgtype.UUID{Bytes: id, Valid: true}, "null", pgtype.UUID{}, "n", 3})

	if got[1] != id.String() {
		t.Errorf("valid uuid = %v", got[1])
	}
	if got[3] != "<null>" {
		t.Errorf("null uuid = %v", got[3])
	}
	if got[5] != 3 {
		t.Errorf("non-uuid value changed: %v", got[5])
	}
}
