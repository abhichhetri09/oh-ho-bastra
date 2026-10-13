package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// emailInterval is how often queued order emails are sent.
const emailInterval = 10 * time.Second

// Run serves until SIGINT/SIGTERM, then shuts down gracefully.
// It returns early with an error if the server fails to listen.
func (a *App) Run() error {
	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", a.Cfg.Port),
		Handler:           a.Router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	bgCtx, stopBackground := context.WithCancel(context.Background())
	defer stopBackground()
	a.startSessionCleanup(bgCtx, sessionCleanupInterval)
	a.startOrderExpiry(bgCtx, orderExpiryInterval)
	emailsDone := closedChan()
	if a.Emails != nil {
		emailsDone = a.Emails.Start(bgCtx, emailInterval)
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("server listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- fmt.Errorf("listen: %w", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(quit)

	select {
	case err := <-errCh:
		return err
	case <-quit:
	}

	slog.Info("shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		return fmt.Errorf("server shutdown: %w", err)
	}
	// Stop the email sender and let it record the send in flight (which the
	// cancel cuts short), so the caller closes the database after it.
	stopBackground()
	select {
	case <-emailsDone:
	case <-ctx.Done():
		slog.Warn("email sender did not stop in time")
	}
	slog.Info("server stopped")
	return nil
}

func closedChan() <-chan struct{} {
	c := make(chan struct{})
	close(c)
	return c
}
