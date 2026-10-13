package types

// StoreThemes are the storefront themes an admin can pick (the oneof below;
// apps/web/lib/themes.ts and the StoreTheme schema list the same ids).
var StoreThemes = []string{"editorial", "studio", "botanical"}

type StoreThemeBody struct {
	Theme string `json:"theme" binding:"required,oneof=editorial studio botanical"`
}
