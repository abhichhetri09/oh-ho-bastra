package emails

import (
	"bytes"
	"fmt"
	"net/url"
	"strings"
)

type resetView struct {
	StoreName string
	Greeting  string
	URL       string
	ShopURL   string
}

// RenderPasswordReset builds the "reset your password" email. The token
// goes in the link only; it's never stored or logged.
func RenderPasswordReset(name, token, frontendURL string) (Rendered, error) {
	shop := strings.TrimRight(frontendURL, "/")
	view := resetView{
		StoreName: StoreName,
		Greeting:  greeting(name),
		URL:       shop + "/auth/reset?token=" + url.QueryEscape(token),
		ShopURL:   shop,
	}
	var html, text bytes.Buffer
	if err := htmlTemplates.ExecuteTemplate(&html, "reset.html.tmpl", view); err != nil {
		return Rendered{}, fmt.Errorf("render reset html: %w", err)
	}
	if err := textTemplates.ExecuteTemplate(&text, "reset.txt.tmpl", view); err != nil {
		return Rendered{}, fmt.Errorf("render reset text: %w", err)
	}
	return Rendered{
		Subject: "Reset your " + StoreName + " password",
		HTML:    html.String(),
		Text:    text.String(),
	}, nil
}
