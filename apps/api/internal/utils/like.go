package utils

import "strings"

// ContainsPattern is an ILIKE pattern matching s anywhere, with s taken
// literally: its % and _ are escaped (backslash is Postgres' default LIKE
// escape).
func ContainsPattern(s string) string {
	return "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s) + "%"
}
