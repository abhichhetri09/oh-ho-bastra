package checkout

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/emails"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/payments"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
)

// Action is something an admin does to an order.
type Action string

const (
	Ship    Action = "ship"
	Deliver Action = "deliver"
	Cancel  Action = "cancel"
	Refund  Action = "refund"
)

// from lists the statuses each action applies to: an order moves
// pending → paid (checkout) → shipped → delivered, an unpaid one can be
// cancelled, and a paid one refunded at any later step.
var from = map[Action][]string{
	Ship:    {"paid"},
	Deliver: {"shipped"},
	Cancel:  {"pending"},
	Refund:  {"paid", "shipped", "delivered"},
}

// refundTimeout bounds a refund, Stripe's answer included (the order row
// stays locked meanwhile).
const refundTimeout = 45 * time.Second

var done = map[Action]string{Ship: "shipped", Deliver: "delivered", Cancel: "cancelled", Refund: "refunded"}

// CanApply reports whether the action applies to an order in this status.
func CanApply(a Action, status string) bool {
	for _, s := range from[a] {
		if s == status {
			return true
		}
	}
	return false
}

func errTransition(a Action, status string) *Refusal {
	return &Refusal{http.StatusConflict, constants.InvalidOrderTransition,
		fmt.Sprintf("This order is %s, so it can't be %s", status, done[a])}
}

var (
	errOrderNotFound = &Refusal{http.StatusNotFound, constants.OrderNotFound, "Order not found"}
	errAlreadyPaid   = &Refusal{http.StatusConflict, constants.OrderAlreadyPaid,
		"This order has just been paid, so it can't be cancelled. Refund it instead."}
	errStripe = &Refusal{http.StatusBadGateway, constants.PaymentProviderError,
		"Stripe didn't answer, so nothing was changed. Try again."}
	errProcessing = &Refusal{http.StatusConflict, constants.InvalidOrderTransition,
		"Stripe is still processing this order's payment. Try again once it settles."}
	errOpening = &Refusal{http.StatusConflict, constants.InvalidOrderTransition,
		"This checkout is still opening. Try again in a minute."}
	errNoPayment = &Refusal{http.StatusConflict, constants.InvalidOrderTransition,
		"No payment is recorded for this order, so there is nothing to refund"}
)

// change locks the order, checks the action applies and runs apply.
func (s *Service) change(ctx context.Context, number int64, a Action,
	apply func(qtx *db.Queries, order db.Order) (db.Order, error)) (db.Order, error) {
	var out db.Order
	err := s.inTx(ctx, func(qtx *db.Queries) error {
		order, err := qtx.AdminGetOrderForUpdate(ctx, number)
		if errors.Is(err, pgx.ErrNoRows) {
			return errOrderNotFound
		}
		if err != nil {
			return fmt.Errorf("get order: %w", err)
		}
		if !CanApply(a, order.Status) {
			return errTransition(a, order.Status)
		}
		out, err = apply(qtx, order)
		return err
	})
	return out, err
}

// Ship marks a paid order shipped, with its tracking number if there is one.
func (s *Service) Ship(ctx context.Context, number int64, tracking string) (db.Order, error) {
	return s.change(ctx, number, Ship, func(qtx *db.Queries, order db.Order) (db.Order, error) {
		shipped, err := qtx.ShipOrder(ctx, db.ShipOrderParams{
			ID:             order.ID,
			TrackingNumber: pgtype.Text{String: tracking, Valid: tracking != ""},
		})
		if err != nil {
			return db.Order{}, err
		}
		return shipped, emails.Enqueue(ctx, qtx, emails.OrderShipped, order.ID)
	})
}

// Deliver marks a shipped order delivered.
func (s *Service) Deliver(ctx context.Context, number int64) (db.Order, error) {
	return s.change(ctx, number, Deliver, func(qtx *db.Queries, order db.Order) (db.Order, error) {
		return qtx.DeliverOrder(ctx, order.ID)
	})
}

// CancelPending cancels an unpaid order and returns its stock. Its Stripe
// page is expired first, so the shopper can't pay a cancelled order; if
// Stripe says it was paid already, the order is settled as paid instead.
func (s *Service) CancelPending(ctx context.Context, number int64) (db.Order, error) {
	order, err := s.queries.AdminGetOrder(ctx, number)
	if errors.Is(err, pgx.ErrNoRows) {
		return db.Order{}, errOrderNotFound
	}
	if err != nil {
		return db.Order{}, fmt.Errorf("get order: %w", err)
	}
	if !CanApply(Cancel, order.Status) {
		return db.Order{}, errTransition(Cancel, order.Status)
	}

	// A pending order without a Stripe page is either still opening one
	// (Start sets it after its transaction) or failed to: cancelling now
	// could leave a payable page behind, so wait until the reservation runs out.
	if !order.StripeSessionID.Valid && s.now().Sub(order.CreatedAt.Time) < ReservationTTL {
		return db.Order{}, errOpening
	}

	if order.StripeSessionID.Valid && s.provider != nil {
		if err := s.provider.ExpireSession(ctx, order.StripeSessionID.String); err != nil {
			// Expiring fails for a page that is already complete or expired.
			session, gerr := s.provider.GetSession(ctx, order.StripeSessionID.String)
			switch {
			case gerr != nil:
				slog.Error("checkout: cancel: stripe", "order", number, "err", err, "get_err", gerr)
				return db.Order{}, errStripe
			case session.Paid:
				if err := s.inTx(ctx, func(qtx *db.Queries) error { return fulfil(ctx, qtx, session) }); err != nil {
					return db.Order{}, err
				}
				return db.Order{}, errAlreadyPaid
			case !session.Expired:
				// Complete but unpaid: a delayed payment method is settling.
				slog.Warn("checkout: cancel: session not expirable", "order", number, "err", err)
				return db.Order{}, errProcessing
			}
		}
	}

	return s.change(ctx, number, Cancel, func(qtx *db.Queries, order db.Order) (db.Order, error) {
		if _, err := release(ctx, qtx, order.ID); err != nil {
			return db.Order{}, err
		}
		return qtx.AdminGetOrder(ctx, number)
	})
}

// RefundPaid refunds a paid order in full through Stripe, and returns its
// stock when restock is set (an order that never shipped, or came back).
// The order stays locked across the Stripe call, and the refund is keyed by
// the order, so a retry after a failure here can't refund twice.
func (s *Service) RefundPaid(ctx context.Context, number int64, restock bool) (db.Order, error) {
	// Once Stripe is asked, finish recording the answer even if the admin's
	// request goes away: a refund Stripe made must not stay "paid" here.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), refundTimeout)
	defer cancel()
	return s.change(ctx, number, Refund, func(qtx *db.Queries, order db.Order) (db.Order, error) {
		payment, err := qtx.GetOrderPayment(ctx, order.ID)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && !payment.StripePaymentIntentID.Valid) {
			return db.Order{}, errNoPayment
		}
		if err != nil {
			return db.Order{}, fmt.Errorf("get payment: %w", err)
		}

		refundID, err := s.provider.Refund(ctx, payment.StripePaymentIntentID.String, "refund-"+utils.UUIDToString(order.ID))
		var refused *payments.RefusedError
		if errors.As(err, &refused) {
			return db.Order{}, &Refusal{http.StatusConflict, constants.RefundRefused,
				"Stripe refused the refund: " + refused.Message}
		}
		if err != nil {
			slog.Error("checkout: refund", "order", number, "err", err)
			return db.Order{}, errStripe
		}
		if err := qtx.RecordRefund(ctx, db.RecordRefundParams{
			ID:             payment.ID,
			StripeRefundID: pgtype.Text{String: refundID, Valid: true},
		}); err != nil {
			return db.Order{}, fmt.Errorf("record refund: %w", err)
		}
		if restock {
			if err := qtx.RestoreStock(ctx, order.ID); err != nil {
				return db.Order{}, fmt.Errorf("restore stock: %w", err)
			}
		}
		slog.Info("checkout: order refunded", "order", number, "restock", restock)
		refunded, err := qtx.RefundOrder(ctx, order.ID)
		if err != nil {
			return db.Order{}, err
		}
		return refunded, emails.Enqueue(ctx, qtx, emails.OrderRefunded, order.ID)
	})
}
