// Package payments is the payment provider seen by checkout: Stripe in
// production, a fake in tests.
package payments

import (
	"context"
	"errors"
	"time"
)

// ErrInvalidSignature means a webhook's signature didn't verify.
var ErrInvalidSignature = errors.New("payments: invalid webhook signature")

// RefusedError is the provider declining a request (a disputed charge, a
// short balance): retrying won't help, unlike an error reaching it.
type RefusedError struct{ Message string }

func (e *RefusedError) Error() string { return "payments: refused: " + e.Message }

// LineItem is one priced line of a hosted checkout page.
type LineItem struct {
	Name       string
	Image      string
	UnitAmount int64 // cents
	Quantity   int64
}

// SessionRequest describes the hosted checkout page for one order. The
// amounts come from our own prices, never from the client.
type SessionRequest struct {
	OrderID     string
	OrderNumber int64
	Email       string
	Currency    string
	Items       []LineItem
	Shipping    int64 // cents; 0 shows as free shipping
	SuccessURL  string
	CancelURL   string
	ExpiresAt   time.Time
}

// Session is what checkout needs to know about a hosted checkout page.
type Session struct {
	ID              string
	URL             string
	OrderID         string // from the session's metadata
	Paid            bool
	Expired         bool
	PaymentIntentID string
	AmountTotal     int64
	Currency        string
}

// EventKind is the part of a webhook event checkout reacts to.
type EventKind int

const (
	EventOther EventKind = iota
	// EventCompleted: the shopper finished checkout; Session.Paid says
	// whether the money is in (delayed methods pay later).
	EventCompleted
	// EventPaid: a delayed payment succeeded.
	EventPaid
	// EventExpired: the page expired unpaid.
	EventExpired
	// EventFailed: a delayed payment failed.
	EventFailed
)

// Event is a verified webhook event.
type Event struct {
	ID      string
	Type    string
	Kind    EventKind
	Session Session
}

// Provider creates and reads hosted checkout pages and verifies webhooks.
type Provider interface {
	CreateSession(ctx context.Context, req SessionRequest) (Session, error)
	GetSession(ctx context.Context, id string) (Session, error)
	ExpireSession(ctx context.Context, id string) error
	// Refund returns a payment in full and gives the refund's id. The
	// idempotency key makes a retry return the same refund, not a second one;
	// a payment refunded already (a retry after the key expired) gives the
	// existing refund. A refusal is a *RefusedError.
	Refund(ctx context.Context, paymentIntentID, idempotencyKey string) (string, error)
	ParseEvent(payload []byte, signature string) (Event, error)
}
