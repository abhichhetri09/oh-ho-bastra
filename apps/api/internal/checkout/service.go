// Package checkout turns a cart into an order and a hosted Stripe Checkout
// page, and settles orders from Stripe's answers.
//
// Stock is reserved when checkout starts (so a paid order can't oversell)
// and returned when the order is cancelled: the page expired, its payment
// failed, the shopper started a new checkout, or the reservation ran out
// without word from Stripe.
package checkout

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/emails"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/payments"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
)

const (
	// ReservationTTL is how long a checkout page lives and holds its stock
	// (Stripe's minimum is 30 minutes).
	ReservationTTL = 31 * time.Minute
	// releaseGrace lets Stripe's own expiry event arrive before the
	// sweeper releases an order itself.
	releaseGrace = 5 * time.Minute
	// MaxAddresses caps an address book.
	MaxAddresses = 10
)

// Refusal is a checkout error the handler sends as is.
type Refusal struct {
	Status  int
	Code    string
	Message string
}

func (r *Refusal) Error() string { return r.Message }

var (
	errCartEmpty     = &Refusal{http.StatusConflict, constants.CartEmpty, "Your bag is empty"}
	errCartHasIssues = &Refusal{http.StatusConflict, constants.CartHasIssues,
		"Some items in your bag need attention before checkout"}
	errAddressNotFound = &Refusal{http.StatusNotFound, constants.AddressNotFound, "Address not found"}
	errProvider        = &Refusal{http.StatusBadGateway, constants.PaymentProviderError,
		"We couldn't reach the payment provider. Your bag is unchanged; try again."}
)

// Service needs a provider; without one (no Stripe key) the handlers
// answer 503 before calling it.
type Service struct {
	pool        *pgxpool.Pool
	queries     *db.Queries
	provider    payments.Provider
	frontendURL string
	now         func() time.Time
}

func NewService(pool *pgxpool.Pool, queries *db.Queries, provider payments.Provider, frontendURL string) *Service {
	return &Service{pool: pool, queries: queries, provider: provider, frontendURL: frontendURL, now: time.Now}
}

// Enabled reports whether payments are configured.
func (s *Service) Enabled() bool { return s != nil && s.provider != nil }

// inTx runs fn in a transaction, committing when it returns nil.
func (s *Service) inTx(ctx context.Context, fn func(qtx *db.Queries) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(s.queries.WithTx(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Start reserves the cart's stock in a new pending order and opens a
// Stripe Checkout page for it.
func (s *Service) Start(ctx context.Context, userID pgtype.UUID, req types.CheckoutRequest) (types.CheckoutResponse, error) {
	user, err := s.queries.GetUserByID(ctx, userID)
	if err != nil {
		return types.CheckoutResponse{}, fmt.Errorf("get user: %w", err)
	}

	// Free reservations that ran out, so their stock counts here.
	if _, err := s.ReleaseExpired(ctx); err != nil {
		slog.Warn("checkout: release expired orders", "err", err)
	}

	var (
		order      db.Order
		lines      []db.GetCartLinesRow
		staleSlots []string // Stripe sessions of the user's replaced checkouts
	)
	err = s.inTx(ctx, func(qtx *db.Queries) error {
		// Lock the cart first, as cart writes do, so it can't change under us.
		if _, err := qtx.EnsureCart(ctx, userID); err != nil {
			return fmt.Errorf("lock cart: %w", err)
		}
		lines, err = qtx.GetCartLines(ctx, userID)
		if err != nil {
			return fmt.Errorf("cart lines: %w", err)
		}
		if len(lines) == 0 {
			return errCartEmpty
		}

		// A new checkout replaces the user's unpaid ones and their holds.
		pending, err := qtx.ListPendingOrdersForUser(ctx, userID)
		if err != nil {
			return fmt.Errorf("pending orders: %w", err)
		}
		for _, p := range pending {
			if _, err := release(ctx, qtx, p.ID); err != nil {
				return err
			}
			if p.StripeSessionID.Valid {
				staleSlots = append(staleSlots, p.StripeSessionID.String)
			}
		}

		if err := reserve(ctx, qtx, lines); err != nil {
			return err
		}

		address, err := s.address(ctx, qtx, userID, req)
		if err != nil {
			return err
		}

		var subtotal int64
		for _, line := range lines {
			subtotal += int64(line.Price) * int64(line.Quantity)
		}
		shipping := constants.ShippingFor(subtotal)
		order, err = qtx.CreateOrder(ctx, db.CreateOrderParams{
			UserID:          userID,
			Subtotal:        int32(subtotal),
			Shipping:        int32(shipping),
			Total:           int32(subtotal + shipping),
			Currency:        constants.Currency,
			Email:           user.Email,
			ShippingAddress: address,
			ExpiresAt:       pgtype.Timestamptz{Time: s.now().Add(ReservationTTL), Valid: true},
		})
		if err != nil {
			return fmt.Errorf("create order: %w", err)
		}
		for _, line := range lines {
			if err := createItem(ctx, qtx, order.ID, line); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return types.CheckoutResponse{}, err
	}

	// The replaced pages can't be paid any more (best effort: their orders
	// are already cancelled, and a late payment is handled in fulfil).
	for _, id := range staleSlots {
		if err := s.provider.ExpireSession(ctx, id); err != nil {
			slog.Warn("checkout: expire replaced session", "session", id, "err", err)
		}
	}

	session, err := s.provider.CreateSession(ctx, s.sessionRequest(order, user.Email, lines))
	if err != nil {
		slog.Error("checkout: create session", "order", order.Number, "err", err)
		if relErr := s.Release(ctx, order.ID); relErr != nil {
			slog.Error("checkout: release after provider failure", "order", order.Number, "err", relErr)
		}
		return types.CheckoutResponse{}, errProvider
	}
	if err := s.queries.SetOrderSession(ctx, db.SetOrderSessionParams{
		ID:              order.ID,
		StripeSessionID: pgtype.Text{String: session.ID, Valid: true},
	}); err != nil {
		// The webhook finds the order by its metadata; this only costs the
		// success page's lookup, which then 404s until a retry.
		slog.Error("checkout: save session id", "order", order.Number, "err", err)
	}
	return types.CheckoutResponse{OrderNumber: order.Number, CheckoutURL: session.URL}, nil
}

// reserve checks every line against the locked variants and takes the stock.
func reserve(ctx context.Context, qtx *db.Queries, lines []db.GetCartLinesRow) error {
	ids := make([]pgtype.UUID, len(lines))
	quantities := make([]int32, len(lines))
	for i, line := range lines {
		ids[i] = line.VariantID
		quantities[i] = line.Quantity
	}
	locked, err := qtx.LockVariants(ctx, ids)
	if err != nil {
		return fmt.Errorf("lock variants: %w", err)
	}
	stock := make(map[[16]byte]db.LockVariantsRow, len(locked))
	for _, v := range locked {
		stock[v.ID.Bytes] = v
	}
	for _, line := range lines {
		v, ok := stock[line.VariantID.Bytes]
		if !ok || !v.Available || v.Stock < line.Quantity {
			return errCartHasIssues
		}
	}
	if err := qtx.TakeStock(ctx, db.TakeStockParams{Ids: ids, Quantities: quantities}); err != nil {
		return fmt.Errorf("take stock: %w", err)
	}
	return nil
}

// address resolves the shipping address to snapshot on the order, saving a
// new one to the address book when asked (and there's room), as the default
// if asked. Two checkouts of one user can't race here: both hold the cart
// lock. The book is locked in id order, as SetDefaultAddress does.
func (s *Service) address(ctx context.Context, qtx *db.Queries, userID pgtype.UUID, req types.CheckoutRequest) (json.RawMessage, error) {
	if req.AddressID != "" {
		id, err := utils.ConvertToUUID(req.AddressID)
		if err != nil {
			return nil, errAddressNotFound
		}
		saved, err := qtx.GetAddress(ctx, db.GetAddressParams{ID: id, UserID: userID})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errAddressNotFound
		}
		if err != nil {
			return nil, fmt.Errorf("get address: %w", err)
		}
		return snapshot(addressFromRow(saved))
	}

	input := normalizeAddress(*req.Address)
	if req.SaveAddress {
		count, err := qtx.CountAddresses(ctx, userID)
		if err != nil {
			return nil, fmt.Errorf("count addresses: %w", err)
		}
		if count < MaxAddresses {
			if req.MakeDefault {
				if err := qtx.LockAddresses(ctx, userID); err != nil {
					return nil, fmt.Errorf("lock addresses: %w", err)
				}
				if err := qtx.ClearDefaultAddress(ctx, userID); err != nil {
					return nil, fmt.Errorf("clear default address: %w", err)
				}
			}
			if _, err := qtx.CreateAddress(ctx, createAddressParams(userID, input, req.MakeDefault)); err != nil {
				return nil, fmt.Errorf("save address: %w", err)
			}
		}
	}
	return snapshot(input)
}

func snapshot(a types.AddressInput) (json.RawMessage, error) {
	b, err := json.Marshal(a)
	if err != nil {
		return nil, fmt.Errorf("snapshot address: %w", err)
	}
	return b, nil
}

func createItem(ctx context.Context, qtx *db.Queries, orderID pgtype.UUID, line db.GetCartLinesRow) error {
	options, err := json.Marshal(line.Options)
	if err != nil {
		return fmt.Errorf("snapshot options: %w", err)
	}
	return qtx.CreateOrderItem(ctx, db.CreateOrderItemParams{
		OrderID:     orderID,
		VariantID:   line.VariantID,
		ProductID:   line.ProductID,
		ProductName: line.ProductName,
		ProductSlug: line.ProductSlug,
		Sku:         line.Sku,
		Options:     options,
		Image:       line.Image,
		UnitPrice:   line.Price,
		Quantity:    line.Quantity,
		LineTotal:   line.Price * line.Quantity,
	})
}

func (s *Service) sessionRequest(order db.Order, email string, lines []db.GetCartLinesRow) payments.SessionRequest {
	items := make([]payments.LineItem, len(lines))
	for i, line := range lines {
		items[i] = payments.LineItem{
			Name:       line.ProductName + optionSuffix(line.Options),
			Image:      line.Image,
			UnitAmount: int64(line.Price),
			Quantity:   int64(line.Quantity),
		}
	}
	return payments.SessionRequest{
		OrderID:     utils.UUIDToString(order.ID),
		OrderNumber: order.Number,
		Email:       email,
		Currency:    order.Currency,
		Items:       items,
		Shipping:    int64(order.Shipping),
		SuccessURL:  s.frontendURL + "/checkout/success?session_id={CHECKOUT_SESSION_ID}",
		CancelURL:   s.frontendURL + "/cart?checkout=cancelled",
		ExpiresAt:   order.ExpiresAt.Time,
	}
}

// Release cancels a pending order and returns its stock.
func (s *Service) Release(ctx context.Context, orderID pgtype.UUID) error {
	return s.inTx(ctx, func(qtx *db.Queries) error {
		_, err := release(ctx, qtx, orderID)
		return err
	})
}

// release cancels the order if it is still pending and then returns its
// stock; it reports whether it did.
func release(ctx context.Context, qtx *db.Queries, orderID pgtype.UUID) (bool, error) {
	n, err := qtx.CancelPendingOrder(ctx, orderID)
	if err != nil {
		return false, fmt.Errorf("cancel order: %w", err)
	}
	if n == 0 {
		return false, nil
	}
	if err := qtx.RestoreStock(ctx, orderID); err != nil {
		return false, fmt.Errorf("restore stock: %w", err)
	}
	return true, nil
}

// ReleaseExpired cancels pending orders whose reservation ran out (plus a
// grace period for Stripe's own expiry event) and returns their stock.
func (s *Service) ReleaseExpired(ctx context.Context) (int, error) {
	var released int
	err := s.inTx(ctx, func(qtx *db.Queries) error {
		orders, err := qtx.ListExpiredPendingOrders(ctx, pgtype.Timestamptz{Time: s.now().Add(-releaseGrace), Valid: true})
		if err != nil {
			return fmt.Errorf("expired orders: %w", err)
		}
		for _, o := range orders {
			ok, err := release(ctx, qtx, o.ID)
			if err != nil {
				return err
			}
			if ok {
				released++
			}
		}
		return nil
	})
	return released, err
}

// HandleEvent applies a verified webhook event once: the event id is
// recorded in the same transaction, so a retry after a failure is applied
// again and a duplicate is skipped.
func (s *Service) HandleEvent(ctx context.Context, event payments.Event) error {
	if event.Kind == payments.EventOther {
		return nil
	}
	return s.inTx(ctx, func(qtx *db.Queries) error {
		fresh, err := qtx.RecordStripeEvent(ctx, db.RecordStripeEventParams{ID: event.ID, Type: event.Type})
		if err != nil {
			return fmt.Errorf("record event: %w", err)
		}
		if fresh == 0 {
			return nil
		}
		switch event.Kind {
		case payments.EventCompleted:
			// Delayed payment methods complete unpaid and pay later (EventPaid).
			if !event.Session.Paid {
				return nil
			}
			return fulfil(ctx, qtx, event.Session)
		case payments.EventPaid:
			return fulfil(ctx, qtx, event.Session)
		case payments.EventExpired, payments.EventFailed:
			orderID, err := utils.ConvertToUUID(event.Session.OrderID)
			if err != nil {
				slog.Warn("checkout: event without an order", "event", event.ID, "type", event.Type)
				return nil
			}
			_, err = release(ctx, qtx, orderID)
			return err
		}
		return nil
	})
}

// Reconcile asks Stripe about a pending order's session and settles it,
// for when no webhook has arrived (or none is set up, as in development).
func (s *Service) Reconcile(ctx context.Context, sessionID string) error {
	session, err := s.provider.GetSession(ctx, sessionID)
	if err != nil {
		return err
	}
	switch {
	case session.Paid:
		return s.inTx(ctx, func(qtx *db.Queries) error { return fulfil(ctx, qtx, session) })
	case session.Expired:
		orderID, err := utils.ConvertToUUID(session.OrderID)
		if err != nil {
			return nil
		}
		return s.Release(ctx, orderID)
	}
	return nil
}

// fulfil marks the session's order paid, once. An order cancelled before
// the money arrived (its page was replaced or ran out) takes its stock back,
// as far as there is any; a shortfall is logged as oversold.
func fulfil(ctx context.Context, qtx *db.Queries, session payments.Session) error {
	orderID, err := utils.ConvertToUUID(session.OrderID)
	if err != nil {
		slog.Warn("checkout: paid session without an order", "session", session.ID)
		return nil
	}
	order, err := qtx.GetOrderForUpdate(ctx, orderID)
	if errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("checkout: paid session for an unknown order", "session", session.ID, "order_id", session.OrderID)
		return nil
	}
	if err != nil {
		return fmt.Errorf("get order: %w", err)
	}

	switch order.Status {
	case "pending":
	case "cancelled":
		short, err := qtx.RetakeStock(ctx, order.ID)
		if err != nil {
			return fmt.Errorf("retake stock: %w", err)
		}
		for _, row := range short {
			// A refund with restock then returns only what was taken.
			if err := qtx.SetItemShortfall(ctx, db.SetItemShortfallParams{
				OrderID: order.ID, VariantID: row.ID, Shortfall: row.Shortfall,
			}); err != nil {
				return fmt.Errorf("record shortfall: %w", err)
			}
		}
		if len(short) > 0 {
			slog.Error("checkout: paid after release, oversold", "order", order.Number, "variants", len(short))
		}
	default:
		return nil // already paid (a duplicate answer)
	}

	if session.AmountTotal != int64(order.Total) {
		slog.Error("checkout: paid amount differs from the order total",
			"order", order.Number, "paid", session.AmountTotal, "total", order.Total)
	}
	if err := qtx.MarkOrderPaid(ctx, order.ID); err != nil {
		return fmt.Errorf("mark paid: %w", err)
	}
	if err := qtx.CreatePayment(ctx, db.CreatePaymentParams{
		OrderID:               order.ID,
		StripeSessionID:       session.ID,
		StripePaymentIntentID: pgtype.Text{String: session.PaymentIntentID, Valid: session.PaymentIntentID != ""},
		Amount:                int32(session.AmountTotal),
		Currency:              session.Currency,
	}); err != nil {
		return fmt.Errorf("record payment: %w", err)
	}
	if err := qtx.RemoveOrderedCartLines(ctx, db.RemoveOrderedCartLinesParams{UserID: order.UserID, OrderID: order.ID}); err != nil {
		return fmt.Errorf("clear bought lines: %w", err)
	}
	if err := emails.Enqueue(ctx, qtx, emails.OrderConfirmed, order.ID); err != nil {
		return err
	}
	slog.Info("checkout: order paid", "order", order.Number)
	return nil
}
