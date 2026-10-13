package utils

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
)

func GenerateSKU(productName string, variantOptions []string) string {
	trimmedName := strings.TrimSpace(productName)
	prefix := strings.ToUpper(strings.ReplaceAll(firstRunes(trimmedName, 3), " ", ""))
	if prefix == "" {
		prefix = "SKU"
	}

	var optionParts []string
	for _, opt := range variantOptions {
		if len(opt) > 0 {
			optionParts = append(optionParts, strings.ToUpper(firstRunes(opt, 3)))
		}
	}

	suffix := strings.Join(optionParts, "-")

	random := strings.ToUpper(uuid.New().String()[:13])

	if suffix != "" {
		return fmt.Sprintf("%s-%s-%s", prefix, suffix, random)
	}
	return fmt.Sprintf("%s-%s", prefix, random)
}

// firstRunes returns the first n runes of s, so multibyte names are never cut
// mid-character.
func firstRunes(s string, n int) string {
	r := []rune(s)
	return string(r[:min(n, len(r))])
}
