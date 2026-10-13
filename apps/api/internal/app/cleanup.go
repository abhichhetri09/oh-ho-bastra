package app

import (
	"context"
	"log/slog"
	"time"
)

const sessionCleanupInterval = time.Hour

// startSessionCleanup deletes expired sessions (and ones revoked over a week
// ago) and stale password reset links at startup and then every interval,
// until ctx is cancelled.
func (a *App) startSessionCleanup(ctx context.Context, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		a.cleanupSessions(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				a.cleanupSessions(ctx)
			}
		}
	}()
}

func (a *App) cleanupSessions(ctx context.Context) {
	deleted, err := a.Queries.DeleteStaleSessions(ctx)
	if err != nil {
		if ctx.Err() == nil {
			slog.Error("session cleanup failed", "err", err)
		}
		return
	}
	if deleted > 0 {
		slog.Info("session cleanup", "deleted", deleted)
	}
	// Reset links a day past their expiry, on the same schedule.
	resets, err := a.Queries.DeleteStalePasswordResets(ctx)
	if err != nil {
		if ctx.Err() == nil {
			slog.Error("password reset cleanup failed", "err", err)
		}
		return
	}
	if resets > 0 {
		slog.Info("password reset cleanup", "deleted", resets)
	}
}

const orderExpiryInterval = 5 * time.Minute

// startOrderExpiry returns the stock of checkouts that ran out without word
// from Stripe (no webhook reached us), at startup and then every interval.
func (a *App) startOrderExpiry(ctx context.Context, interval time.Duration) {
	if !a.Checkout.Enabled() {
		return
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		a.releaseExpiredOrders(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				a.releaseExpiredOrders(ctx)
			}
		}
	}()
}

func (a *App) releaseExpiredOrders(ctx context.Context) {
	released, err := a.Checkout.ReleaseExpired(ctx)
	if err != nil {
		if ctx.Err() == nil {
			slog.Error("order expiry failed", "err", err)
		}
		return
	}
	if released > 0 {
		slog.Info("order expiry", "released", released)
	}
}
