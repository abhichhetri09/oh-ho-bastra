package payments

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"

	"github.com/stripe/stripe-go/v85"
	"github.com/stripe/stripe-go/v85/webhook"
)

// Stripe implements Provider with Stripe Checkout.
type Stripe struct {
	client *stripe.Client
	// webhookSecrets are tried in turn: the dashboard endpoint's secret and,
	// in development, the one `stripe listen` signs with.
	webhookSecrets []string
}

// NewStripe needs a secret key and at least one webhook signing secret.
func NewStripe(secretKey string, webhookSecrets []string) (*Stripe, error) {
	if secretKey == "" {
		return nil, errors.New("payments: STRIPE_SECRET_KEY is empty")
	}
	if len(webhookSecrets) == 0 {
		return nil, errors.New("payments: no Stripe webhook secret")
	}
	return &Stripe{client: stripe.NewClient(secretKey), webhookSecrets: webhookSecrets}, nil
}

func (s *Stripe) CreateSession(ctx context.Context, req SessionRequest) (Session, error) {
	items := make([]*stripe.CheckoutSessionCreateLineItemParams, 0, len(req.Items))
	for _, item := range req.Items {
		product := &stripe.CheckoutSessionCreateLineItemPriceDataProductDataParams{
			Name: stripe.String(item.Name),
		}
		if item.Image != "" {
			product.Images = []*string{stripe.String(item.Image)}
		}
		items = append(items, &stripe.CheckoutSessionCreateLineItemParams{
			Quantity: stripe.Int64(item.Quantity),
			PriceData: &stripe.CheckoutSessionCreateLineItemPriceDataParams{
				Currency:    stripe.String(req.Currency),
				UnitAmount:  stripe.Int64(item.UnitAmount),
				ProductData: product,
			},
		})
	}

	shippingName := "Standard shipping"
	if req.Shipping == 0 {
		shippingName = "Free shipping"
	}
	number := strconv.FormatInt(req.OrderNumber, 10)
	params := &stripe.CheckoutSessionCreateParams{
		Mode: stripe.String(string(stripe.CheckoutSessionModePayment)),
		// Charge exactly the order total in its currency: with Adaptive
		// Pricing on, Stripe may present (and report) a converted amount.
		AdaptivePricing:   &stripe.CheckoutSessionCreateAdaptivePricingParams{Enabled: stripe.Bool(false)},
		LineItems:         items,
		CustomerEmail:     stripe.String(req.Email),
		ClientReferenceID: stripe.String(req.OrderID),
		Metadata:          map[string]string{"order_id": req.OrderID, "order_number": number},
		PaymentIntentData: &stripe.CheckoutSessionCreatePaymentIntentDataParams{
			Description: stripe.String("Oh Ho Bastra order " + number),
			Metadata:    map[string]string{"order_id": req.OrderID},
		},
		ShippingOptions: []*stripe.CheckoutSessionCreateShippingOptionParams{{
			ShippingRateData: &stripe.CheckoutSessionCreateShippingOptionShippingRateDataParams{
				DisplayName: stripe.String(shippingName),
				Type:        stripe.String("fixed_amount"),
				FixedAmount: &stripe.CheckoutSessionCreateShippingOptionShippingRateDataFixedAmountParams{
					Amount:   stripe.Int64(req.Shipping),
					Currency: stripe.String(req.Currency),
				},
			},
		}},
		SuccessURL: stripe.String(req.SuccessURL),
		CancelURL:  stripe.String(req.CancelURL),
		ExpiresAt:  stripe.Int64(req.ExpiresAt.Unix()),
	}
	// A retried request for the same order gets the same session.
	params.SetIdempotencyKey("checkout-" + req.OrderID)

	session, err := s.client.V1CheckoutSessions.Create(ctx, params)
	if err != nil {
		return Session{}, fmt.Errorf("stripe: create checkout session: %w", err)
	}
	return fromStripe(session), nil
}

func (s *Stripe) GetSession(ctx context.Context, id string) (Session, error) {
	session, err := s.client.V1CheckoutSessions.Retrieve(ctx, id, nil)
	if err != nil {
		return Session{}, fmt.Errorf("stripe: retrieve checkout session: %w", err)
	}
	return fromStripe(session), nil
}

func (s *Stripe) ExpireSession(ctx context.Context, id string) error {
	if _, err := s.client.V1CheckoutSessions.Expire(ctx, id, nil); err != nil {
		return fmt.Errorf("stripe: expire checkout session: %w", err)
	}
	return nil
}

func (s *Stripe) Refund(ctx context.Context, paymentIntentID, idempotencyKey string) (string, error) {
	params := &stripe.RefundCreateParams{PaymentIntent: stripe.String(paymentIntentID)}
	params.SetIdempotencyKey(idempotencyKey)
	refund, err := s.client.V1Refunds.Create(ctx, params)
	if err == nil {
		return refund.ID, nil
	}
	var stripeErr *stripe.Error
	if errors.As(err, &stripeErr) {
		if stripeErr.Code == stripe.ErrorCodeChargeAlreadyRefunded {
			if id, ok := s.existingRefund(ctx, paymentIntentID); ok {
				return id, nil
			}
		}
		if stripeErr.HTTPStatusCode >= 400 && stripeErr.HTTPStatusCode < 500 {
			return "", &RefusedError{Message: stripeErr.Msg}
		}
	}
	return "", fmt.Errorf("stripe: refund: %w", err)
}

// existingRefund finds the payment's refund that went through (or is going).
func (s *Stripe) existingRefund(ctx context.Context, paymentIntentID string) (string, bool) {
	params := &stripe.RefundListParams{PaymentIntent: stripe.String(paymentIntentID)}
	for refund, err := range s.client.V1Refunds.List(ctx, params).All(ctx) {
		if err != nil {
			return "", false
		}
		if refund.Status == stripe.RefundStatusSucceeded || refund.Status == stripe.RefundStatusPending {
			return refund.ID, true
		}
	}
	return "", false
}

func (s *Stripe) ParseEvent(payload []byte, signature string) (Event, error) {
	var (
		event stripe.Event
		err   error
	)
	for _, secret := range s.webhookSecrets {
		// Events carry the account's API version, which needn't match the
		// library's; only the fields read below matter.
		event, err = webhook.ConstructEventWithOptions(payload, signature, secret,
			webhook.ConstructEventOptions{IgnoreAPIVersionMismatch: true})
		if err == nil {
			break
		}
	}
	if err != nil {
		return Event{}, ErrInvalidSignature
	}

	out := Event{ID: event.ID, Type: string(event.Type)}
	switch event.Type {
	case "checkout.session.completed":
		out.Kind = EventCompleted
	case "checkout.session.async_payment_succeeded":
		out.Kind = EventPaid
	case "checkout.session.expired":
		out.Kind = EventExpired
	case "checkout.session.async_payment_failed":
		out.Kind = EventFailed
	default:
		return out, nil
	}

	var session stripe.CheckoutSession
	if err := json.Unmarshal(event.Data.Raw, &session); err != nil {
		return Event{}, fmt.Errorf("stripe: decode %s: %w", event.Type, err)
	}
	out.Session = fromStripe(&session)
	return out, nil
}

func fromStripe(s *stripe.CheckoutSession) Session {
	out := Session{
		ID:          s.ID,
		URL:         s.URL,
		OrderID:     s.Metadata["order_id"],
		Paid:        s.PaymentStatus == stripe.CheckoutSessionPaymentStatusPaid,
		Expired:     s.Status == stripe.CheckoutSessionStatusExpired,
		AmountTotal: s.AmountTotal,
		Currency:    string(s.Currency),
	}
	if s.PaymentIntent != nil {
		out.PaymentIntentID = s.PaymentIntent.ID
	}
	return out
}
