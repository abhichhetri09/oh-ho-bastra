// Package emails sends the shopper's order emails. A status change queues
// its email in the same transaction (Enqueue), and the sender (Worker)
// delivers the queue with retries, so a slow or unreachable mail server
// never holds up a webhook or an admin, and a rolled-back change sends
// nothing.
package emails

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

// Email kinds (email_outbox.kind).
const (
	OrderConfirmed = "order_confirmed"
	OrderShipped   = "order_shipped"
	OrderRefunded  = "order_refunded"
)

// Enqueue queues an order email in qtx's transaction. Each kind is sent
// once per order, so a replayed webhook queues nothing new.
func Enqueue(ctx context.Context, qtx *db.Queries, kind string, orderID pgtype.UUID) error {
	if _, ok := copies[kind]; !ok {
		return fmt.Errorf("unknown email kind %q", kind)
	}
	if err := qtx.EnqueueEmail(ctx, db.EnqueueEmailParams{Kind: kind, OrderID: orderID}); err != nil {
		return fmt.Errorf("queue %s email: %w", kind, err)
	}
	return nil
}
