package review

import (
	"testing"

	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

func TestSummarise(t *testing.T) {
	s := summarise([]db.ReviewDistributionRow{{Rating: 5, Count: 2}, {Rating: 4, Count: 1}, {Rating: 1, Count: 1}})
	if s.Count != 4 || s.Average != 3.8 || s.Distribution != [5]int32{1, 0, 0, 1, 2} {
		t.Errorf("summary = %+v", s)
	}
	empty := summarise(nil)
	if empty.Count != 0 || empty.Average != 0 {
		t.Errorf("empty summary = %+v", empty)
	}
	// an out-of-range star (the DB check forbids it) is ignored, not a panic
	if odd := summarise([]db.ReviewDistributionRow{{Rating: 9, Count: 3}}); odd.Count != 0 {
		t.Errorf("odd summary = %+v", odd)
	}
}

func TestDisplayName(t *testing.T) {
	for in, want := range map[string]string{
		"Ada Lovelace":              "Ada L.",
		"  Grace  Brewster Hopper ": "Grace H.",
		"Cher":                      "Cher",
		"":                          "A customer",
		"सुप्रिम खत्री":             "सुप्रिम ख.",
		"ada lovelace":              "ada L.",
	} {
		if got := displayName(in); got != want {
			t.Errorf("displayName(%q) = %q, want %q", in, got, want)
		}
	}
}
