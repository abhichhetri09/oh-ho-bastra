package checkout_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	checkoutsvc "github.com/suprimkhatri77/cartspace/backend/internal/checkout"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	"github.com/suprimkhatri77/cartspace/backend/internal/handlers/checkout"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/payments"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

// fakeProvider only has to exist: these requests are refused before any
// provider or database call.
type fakeProvider struct{ payments.Provider }

func (fakeProvider) ParseEvent([]byte, string) (payments.Event, error) {
	return payments.Event{}, payments.ErrInvalidSignature
}

func serve(svc *checkoutsvc.Service, method, path, body string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	validator.Init()
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(constants.UserIDKey, "0f6ada99-b884-4c07-88d4-7843a41cdda8")
	})
	r.POST("/checkout", checkout.StartCheckout(svc))
	r.POST("/webhooks/stripe", checkout.StripeWebhook(svc, fakeProvider{}))
	r.GET("/checkout/sessions/:sessionID", checkout.SessionOrder(svc, nil))
	r.PUT("/addresses/:addressID/default", checkout.SetDefaultAddress(nil, nil))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(method, path, strings.NewReader(body)))
	return w
}

func TestCheckoutUnavailableWithoutStripe(t *testing.T) {
	for _, tt := range []struct{ method, path string }{
		{http.MethodPost, "/checkout"},
		{http.MethodPost, "/webhooks/stripe"},
		{http.MethodGet, "/checkout/sessions/cs_test_1"},
	} {
		w := serve(checkoutsvc.NewService(nil, nil, nil, ""), tt.method, tt.path, `{}`)
		if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), constants.PaymentsUnavailable) {
			t.Errorf("%s %s: %d %s", tt.method, tt.path, w.Code, w.Body.String())
		}
	}
}

func TestCheckoutRefusedBeforeAnyWork(t *testing.T) {
	svc := checkoutsvc.NewService(nil, nil, fakeProvider{}, "http://localhost:3000")
	address := `{"full_name":"Ada","phone":"5550100","line1":"1 Main","city":"X","postal_code":"1","country":"GB"}`
	tests := []struct {
		name, method, path, body, code string
		status                         int
	}{
		{"neither address", http.MethodPost, "/checkout", `{}`, constants.ValidationFailed, 400},
		{"both addresses", http.MethodPost, "/checkout",
			`{"address_id":"0f6ada99-b884-4c07-88d4-7843a41cdda8","address":` + address + `}`, constants.ValidationFailed, 400},
		{"unshipped country", http.MethodPost, "/checkout",
			`{"address":` + strings.Replace(address, `"GB"`, `"ZZ"`, 1) + `}`, constants.ValidationFailed, 400},
		{"bad address id", http.MethodPost, "/checkout", `{"address_id":"nope"}`, constants.ValidationFailed, 400},
		{"unsigned webhook", http.MethodPost, "/webhooks/stripe", `{}`, constants.InvalidWebhookSignature, 400},
		{"not a session id", http.MethodGet, "/checkout/sessions/pi_123", ``, constants.InvalidSessionID, 400},
		{"default: bad address id", http.MethodPut, "/addresses/nope/default", ``, constants.InvalidAddressID, 400},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := serve(svc, tt.method, tt.path, tt.body)
			if w.Code != tt.status || !strings.Contains(w.Body.String(), tt.code) {
				t.Errorf("got %d %s, want %d %s", w.Code, w.Body.String(), tt.status, tt.code)
			}
		})
	}
}
