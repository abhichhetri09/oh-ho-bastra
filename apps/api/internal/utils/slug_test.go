package utils

import "testing"

func TestSlugMatches(t *testing.T) {
	tests := []struct {
		current, base string
		want          bool
	}{
		{"shoe", "shoe", true},
		{"shoe-ab12cd3", "shoe", true}, // suffixed duplicate keeps its URL
		{"shoe-red", "shoe", false},    // renamed from "Shoe Red"
		{"shoes-ab12cd3", "shoe", false},
		{"shoe", "shoes", false},
	}
	for _, tt := range tests {
		if got := SlugMatches(tt.current, tt.base); got != tt.want {
			t.Errorf("SlugMatches(%q, %q) = %v, want %v", tt.current, tt.base, got, tt.want)
		}
	}
}
