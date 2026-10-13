package types

import (
	"reflect"
	"strings"
	"testing"
)

// The binding's oneof must list exactly StoreThemes, or the API would accept
// a theme the web can't render (or reject one it can).
func TestStoreThemeOneofMatchesList(t *testing.T) {
	field, _ := reflect.TypeOf(StoreThemeBody{}).FieldByName("Theme")
	var oneof []string
	for _, rule := range strings.Split(field.Tag.Get("binding"), ",") {
		if values, ok := strings.CutPrefix(rule, "oneof="); ok {
			oneof = strings.Fields(values)
		}
	}
	if !reflect.DeepEqual(oneof, StoreThemes) {
		t.Fatalf("oneof %v, StoreThemes %v", oneof, StoreThemes)
	}
}
