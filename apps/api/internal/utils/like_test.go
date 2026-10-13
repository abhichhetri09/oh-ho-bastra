package utils

import "testing"

func TestContainsPattern(t *testing.T) {
	for in, want := range map[string]string{
		"linen":   "%linen%",
		"100%":    `%100\%%`,
		"a_b":     `%a\_b%`,
		`back\sl`: `%back\\sl%`,
	} {
		if got := ContainsPattern(in); got != want {
			t.Errorf("ContainsPattern(%q) = %q, want %q", in, got, want)
		}
	}
}
