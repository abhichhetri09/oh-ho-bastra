package app

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/database"
	dbgen "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/emails"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/cloudinary"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/payments"
)

func initDB(ctx context.Context, cfg *config.Config) (*database.DB, error) {
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("config: DATABASE_URL is required")
	}
	db, err := database.ConnectWithRetry(ctx, cfg.DatabaseURL, 10)
	if err != nil {
		return nil, fmt.Errorf("database: %w", err)
	}
	return db, nil
}

func initCloudinary(cfg *config.Config) (*cloudinary.Client, error) {
	c, err := cloudinary.New(cfg.CloudinaryCloudName, cfg.CloudinaryAPIKey, cfg.CloudinaryAPISecret)
	if err != nil {
		return nil, fmt.Errorf("cloudinary: %w", err)
	}
	return c, nil
}

// initPayments returns Stripe, or nil (checkout disabled) without a key so
// the API still runs where payments aren't configured, such as CI.
func initPayments(cfg *config.Config) payments.Provider {
	if cfg.StripeSecretKey == "" {
		slog.Warn("payments disabled: STRIPE_SECRET_KEY is not set")
		return nil
	}
	if cfg.FrontendURL == "" {
		slog.Warn("payments disabled: FRONTEND_URL is needed for the checkout return pages")
		return nil
	}
	provider, err := payments.NewStripe(cfg.StripeSecretKey, cfg.StripeWebhookSecrets)
	if err != nil {
		slog.Warn("payments disabled", "err", err)
		return nil
	}
	return provider
}

// initEmails returns the order email sender, or nil without SMTP_HOST:
// emails then stay queued, and those under two days old go out once mail
// is set up.
func initEmails(cfg *config.Config, queries *dbgen.Queries) *emails.Worker {
	if !cfg.MailEnabled() {
		slog.Warn("order emails disabled: SMTP_HOST is not set (they stay queued)")
		return nil
	}
	if cfg.FrontendURL == "" {
		slog.Warn("order emails: FRONTEND_URL is not set, so their order links won't work")
	}
	return emails.NewWorker(queries, emails.NewSMTP(cfg), cfg.FrontendURL)
}

// initMailer returns the sender for emails sent straight from a request
// (password reset links), or nil without SMTP_HOST. A nil interface, not a
// nil *SMTP, so handlers can test it.
func initMailer(cfg *config.Config) emails.Sender {
	if !cfg.MailEnabled() {
		return nil
	}
	return emails.NewSMTP(cfg)
}

func initLogger() {
	var handler slog.Handler
	if os.Getenv("GO_ENV") == "production" {
		handler = slog.NewJSONHandler(os.Stdout, nil)
	} else {
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level:     slog.LevelDebug,
			AddSource: true,
		})
	}
	slog.SetDefault(slog.New(handler))
}
