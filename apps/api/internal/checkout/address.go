package checkout

import (
	"encoding/json"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
)

// normalizeAddress trims every field and collapses inner whitespace.
func normalizeAddress(a types.AddressInput) types.AddressInput {
	clean := func(s string) string { return strings.Join(strings.Fields(s), " ") }
	return types.AddressInput{
		FullName:   clean(a.FullName),
		Phone:      clean(a.Phone),
		Line1:      clean(a.Line1),
		Line2:      clean(a.Line2),
		City:       clean(a.City),
		Region:     clean(a.Region),
		PostalCode: strings.ToUpper(clean(a.PostalCode)),
		Country:    a.Country,
	}
}

func addressFromRow(a db.Address) types.AddressInput {
	return types.AddressInput{
		FullName:   a.FullName,
		Phone:      a.Phone,
		Line1:      a.Line1,
		Line2:      a.Line2.String,
		City:       a.City,
		Region:     a.Region.String,
		PostalCode: a.PostalCode,
		Country:    a.Country,
	}
}

func createAddressParams(userID pgtype.UUID, a types.AddressInput, isDefault bool) db.CreateAddressParams {
	return db.CreateAddressParams{
		UserID:     userID,
		FullName:   a.FullName,
		Phone:      a.Phone,
		Line1:      a.Line1,
		Line2:      utils.ToNullableText(a.Line2),
		City:       a.City,
		Region:     utils.ToNullableText(a.Region),
		PostalCode: a.PostalCode,
		Country:    a.Country,
		IsDefault:  isDefault,
	}
}

// optionSuffix is " (Black / M)" for the hosted checkout's line names, so
// two variants of one product read apart; "" without options.
func optionSuffix(options any) string {
	raw, err := json.Marshal(options)
	if err != nil {
		return ""
	}
	var parsed []struct {
		Value string `json:"value"`
	}
	if json.Unmarshal(raw, &parsed) != nil || len(parsed) == 0 {
		return ""
	}
	values := make([]string, len(parsed))
	for i, o := range parsed {
		values[i] = o.Value
	}
	return " (" + strings.Join(values, " / ") + ")"
}
