package utils

import (
	"reflect"
	"strings"
)

// TrimStruct trims surrounding whitespace from the string fields of the
// struct obj points to, including strings inside nested structs and slices
// (e.g. variant properties, image URLs). Fields tagged `trim:"-"` (e.g.
// passwords) and top-level fields named in skip are left untouched.
func TrimStruct(obj any, skip ...string) {
	v := reflect.ValueOf(obj)
	if v.Kind() != reflect.Ptr || v.Elem().Kind() != reflect.Struct {
		return
	}

	skipSet := make(map[string]bool, len(skip))
	for _, s := range skip {
		skipSet[s] = true
	}
	trimStruct(v.Elem(), skipSet)
}

func trimStruct(v reflect.Value, skip map[string]bool) {
	for i := 0; i < v.NumField(); i++ {
		field := v.Type().Field(i)
		if !field.IsExported() || skip[field.Name] || field.Tag.Get("trim") == "-" {
			continue
		}
		trimValue(v.Field(i))
	}
}

func trimValue(v reflect.Value) {
	switch v.Kind() {
	case reflect.String:
		if v.CanSet() {
			v.SetString(strings.TrimSpace(v.String()))
		}
	case reflect.Ptr:
		if !v.IsNil() {
			trimValue(v.Elem())
		}
	case reflect.Struct:
		trimStruct(v, nil)
	case reflect.Slice, reflect.Array:
		for i := 0; i < v.Len(); i++ {
			trimValue(v.Index(i))
		}
	}
}
