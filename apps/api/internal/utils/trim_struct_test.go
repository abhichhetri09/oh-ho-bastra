package utils

import "testing"

func TestTrimStructNested(t *testing.T) {
	type prop struct {
		Name  string
		Value string
	}
	type body struct {
		Name     string
		Password string `trim:"-"`
		Images   []string
		Props    []prop
		Note     *string
		Skipped  string
	}

	note := "  n  "
	b := body{
		Name:     " a ",
		Password: " pw ",
		Images:   []string{" https://x.io/a.png "},
		Props:    []prop{{Name: " color ", Value: " red "}},
		Note:     &note,
		Skipped:  " s ",
	}
	TrimStruct(&b, "Skipped")

	if b.Name != "a" || b.Images[0] != "https://x.io/a.png" || b.Props[0].Name != "color" ||
		b.Props[0].Value != "red" || *b.Note != "n" {
		t.Fatalf("not trimmed: %+v", b)
	}
	if b.Password != " pw " || b.Skipped != " s " {
		t.Fatalf("trim:\"-\" or skipped field modified: %+v", b)
	}
}
