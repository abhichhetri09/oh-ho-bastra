package emails

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

const (
	// batchSize emails are claimed per round, each leased for lease: long
	// enough to send them all even if every send hits sendTimeout.
	batchSize   = 10
	sendTimeout = 45 * time.Second
	lease       = 10 * time.Minute
	// A failed send is retried after 1m, 2m, 4m... (at most maxBackoff),
	// and given up after maxAttempts.
	firstBackoff = time.Minute
	maxBackoff   = time.Hour
	maxAttempts  = 8
	// An email still unsent after maxAge is dropped: after mail was down
	// for days, an "order confirmed" for an order that has since shipped
	// would only confuse.
	maxAge = 48 * time.Hour
	// lastErrorLen caps the error kept on the row.
	lastErrorLen = 500
)

// store is what the worker needs from the database (*db.Queries).
type store interface {
	ClaimDueEmails(ctx context.Context, arg db.ClaimDueEmailsParams) ([]db.EmailOutbox, error)
	GetEmailOrder(ctx context.Context, id pgtype.UUID) (db.GetEmailOrderRow, error)
	GetOrderItems(ctx context.Context, orderID pgtype.UUID) ([]db.OrderItem, error)
	MarkEmailSent(ctx context.Context, id pgtype.UUID) error
	RetryEmail(ctx context.Context, arg db.RetryEmailParams) error
	FailEmail(ctx context.Context, arg db.FailEmailParams) error
}

// Worker delivers the email outbox.
type Worker struct {
	store       store
	sender      Sender
	frontendURL string
	now         func() time.Time
}

func NewWorker(queries *db.Queries, sender Sender, frontendURL string) *Worker {
	return &Worker{store: queries, sender: sender, frontendURL: frontendURL, now: time.Now}
}

// Start sends due emails at startup and then every interval, until ctx is
// cancelled. The returned channel closes once the sender has stopped, so
// shutdown can let it record the email in flight before the database goes.
func (w *Worker) Start(ctx context.Context, interval time.Duration) <-chan struct{} {
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		w.run(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				w.run(ctx)
			}
		}
	}()
	return done
}

// run sends rounds of due emails until none are left.
func (w *Worker) run(ctx context.Context) {
	for ctx.Err() == nil {
		n, err := w.SendDue(ctx)
		if err != nil {
			if ctx.Err() == nil {
				slog.Error("emails: send round failed", "err", err)
			}
			return
		}
		if n < batchSize {
			return
		}
	}
}

// SendDue claims a batch of due emails and tries each once. It returns how
// many it claimed.
func (w *Worker) SendDue(ctx context.Context) (int, error) {
	rows, err := w.store.ClaimDueEmails(ctx, db.ClaimDueEmailsParams{
		LeaseSeconds: int32(lease / time.Second),
		Batch:        batchSize,
	})
	if err != nil {
		return 0, fmt.Errorf("claim: %w", err)
	}
	for _, row := range rows {
		if ctx.Err() != nil {
			break // the rest go back to the queue when their lease ends
		}
		w.deliver(ctx, row)
	}
	return len(rows), nil
}

// deliver sends one claimed email and records the outcome.
func (w *Worker) deliver(ctx context.Context, row db.EmailOutbox) {
	// Record the outcome even if shutdown starts mid-send: an email that
	// went out must not stay pending, or it is sent again.
	record := context.WithoutCancel(ctx)
	log := slog.With("email", row.Kind, "attempt", row.Attempts)

	if queued := queuedAt(row); queued.Valid && w.now().Sub(queued.Time) > maxAge {
		log.Warn("emails: dropped, too old to send")
		w.fail(record, row, "not sent within 48 hours")
		return
	}

	msg, number, err := w.compose(ctx, row)
	if err == nil {
		log = log.With("order", number)
		sendCtx, cancel := context.WithTimeout(ctx, sendTimeout)
		err = w.sender.Send(sendCtx, msg)
		cancel()
	}

	var permanent *PermanentError
	switch {
	case err == nil:
		if err := w.store.MarkEmailSent(record, row.ID); err != nil {
			log.Error("emails: sent but not recorded", "err", err)
			return
		}
		log.Info("emails: sent")
	case ctx.Err() != nil:
		// Shutting down: it is taken again when its lease runs out.
		log.Info("emails: interrupted by shutdown", "err", err)
	case errors.As(err, &permanent):
		log.Error("emails: can't be sent", "err", err)
		w.fail(record, row, err.Error())
	case row.Attempts >= maxAttempts:
		log.Error("emails: giving up", "err", err)
		w.fail(record, row, err.Error())
	default:
		delay := backoff(row.Attempts)
		log.Warn("emails: send failed, will retry", "err", err, "in", delay)
		if err := w.store.RetryEmail(record, db.RetryEmailParams{
			DelaySeconds: int32(delay / time.Second),
			LastError:    errorText(err.Error()),
			ID:           row.ID,
		}); err != nil {
			log.Error("emails: schedule retry", "err", err)
		}
	}
}

// compose renders the email from the order as it is now. Loading the order
// can fail for a while (the database); rendering it fails for good.
func (w *Worker) compose(ctx context.Context, row db.EmailOutbox) (Message, int64, error) {
	order, err := w.store.GetEmailOrder(ctx, row.OrderID)
	if err != nil {
		return Message{}, 0, fmt.Errorf("get order: %w", err)
	}
	items, err := w.store.GetOrderItems(ctx, row.OrderID)
	if err != nil {
		return Message{}, order.Order.Number, fmt.Errorf("get items: %w", err)
	}
	r, err := Render(row.Kind, order.Order, order.CustomerName, items, w.frontendURL)
	if err != nil {
		// A template or kind error fails the same way every time.
		return Message{}, order.Order.Number, &PermanentError{err}
	}
	return Message{To: order.Order.Email, Subject: r.Subject, HTML: r.HTML, Text: r.Text}, order.Order.Number, nil
}

func (w *Worker) fail(ctx context.Context, row db.EmailOutbox, reason string) {
	if err := w.store.FailEmail(ctx, db.FailEmailParams{LastError: errorText(reason), ID: row.ID}); err != nil {
		slog.Error("emails: mark failed", "email", row.Kind, "err", err)
	}
}

// backoff is the wait before retrying after the given attempt (1-based).
func backoff(attempt int32) time.Duration {
	d := firstBackoff
	for i := int32(1); i < attempt && d < maxBackoff; i++ {
		d *= 2
	}
	return min(d, maxBackoff)
}

func errorText(s string) pgtype.Text {
	if len(s) > lastErrorLen {
		// A cut can split a character, and Postgres rejects invalid UTF-8.
		s = strings.ToValidUTF8(s[:lastErrorLen], "")
	}
	return pgtype.Text{String: s, Valid: true}
}

// queuedAt is when the email's current run of attempts began: when it was
// queued, or when an admin last sent it back to the queue.
func queuedAt(row db.EmailOutbox) pgtype.Timestamptz {
	if row.RequeuedAt.Valid {
		return row.RequeuedAt
	}
	return row.CreatedAt
}
