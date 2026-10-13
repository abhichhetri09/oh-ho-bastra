package config

import (
	"strings"
	"testing"
)

func TestValidateAuth(t *testing.T) {
	a := strings.Repeat("a", 32)
	b := strings.Repeat("b", 32)

	tests := []struct {
		name            string
		access, refresh string
		wantErr         bool
	}{
		{"valid", a, b, false},
		{"empty access", "", b, true},
		{"empty refresh", a, "", true},
		{"short", a[:31], b, true},
		{"same secret", a, a, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := (&Config{JWTAccessSecret: tt.access, JWTRefreshSecret: tt.refresh}).ValidateAuth()
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestSplitList(t *testing.T) {
	got := splitList(" 10.0.0.0/8, ,172.16.0.1 ,")
	if len(got) != 2 || got[0] != "10.0.0.0/8" || got[1] != "172.16.0.1" {
		t.Fatalf("got %q", got)
	}
	if splitList("") != nil {
		t.Fatal("empty value must give no proxies")
	}
}

func TestValidateMail(t *testing.T) {
	ok := Config{SMTPHost: "mailpit", SMTPPort: 1025, SMTPTLS: SMTPNoTLS, MailFrom: "Oh Ho Bastra <orders@example.com>"}

	tests := []struct {
		name    string
		edit    func(c *Config)
		wantErr bool
	}{
		{"valid", func(c *Config) {}, false},
		{"mail off checks nothing", func(c *Config) { *c = Config{} }, false},
		{"bare address", func(c *Config) { c.MailFrom = "orders@example.com" }, false},
		{"no sender", func(c *Config) { c.MailFrom = "" }, true},
		{"bad sender", func(c *Config) { c.MailFrom = "Oh Ho Bastra" }, true},
		{"unknown tls mode", func(c *Config) { c.SMTPTLS = "ssl" }, true},
		{"port out of range", func(c *Config) { c.SMTPPort = 70000 }, true},
		{"username without password", func(c *Config) { c.SMTPUsername = "u" }, true},
		{"username and password", func(c *Config) { c.SMTPUsername, c.SMTPPassword = "u", "p" }, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := ok
			tt.edit(&c)
			err := c.ValidateMail()
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
