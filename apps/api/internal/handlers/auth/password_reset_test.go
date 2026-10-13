package auth

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/emails"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

type nopSender struct{}

func (nopSender) Send(context.Context, emails.Message) error { return nil }

func postForgot(t *testing.T, cfg *config.Config, mailer emails.Sender, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	validator.Init()
	r := gin.New()
	// queries is nil: these cases must answer before touching the database.
	r.POST("/forgot", ForgotPassword(nil, cfg, mailer))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/forgot", bytes.NewBufferString(body)))
	return w
}

func TestForgotPasswordWithoutMail(t *testing.T) {
	cfg := &config.Config{FrontendURL: "https://shop.example"}
	for name, tc := range map[string]struct {
		cfg    *config.Config
		mailer emails.Sender
	}{
		"no mailer":       {cfg, nil},
		"no frontend url": {&config.Config{}, nopSender{}},
	} {
		w := postForgot(t, tc.cfg, tc.mailer, `{"email":"ada@example.org"}`)
		if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), "MAIL_UNAVAILABLE") {
			t.Errorf("%s: got %d %s", name, w.Code, w.Body.String())
		}
	}
}

func TestForgotPasswordValidatesEmail(t *testing.T) {
	cfg := &config.Config{FrontendURL: "https://shop.example"}
	w := postForgot(t, cfg, nopSender{}, `{"email":"not-an-email"}`)
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "VALIDATION_FAILED") {
		t.Errorf("got %d %s", w.Code, w.Body.String())
	}
}

func TestResetTokens(t *testing.T) {
	a, hashA, err := newResetToken()
	if err != nil {
		t.Fatal(err)
	}
	b, _, _ := newResetToken()
	if a == b {
		t.Fatal("tokens must be random")
	}
	if len(a) != 43 || strings.ContainsAny(a, "+/=") {
		t.Errorf("token %q: want 43 URL-safe characters", a)
	}
	if hashA != hashResetToken(a) || hashA == a || len(hashA) != 64 {
		t.Errorf("hash %q: want the sha256 hex of the token", hashA)
	}
}
