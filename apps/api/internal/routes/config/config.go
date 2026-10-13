package config

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suprimkhatri77/cartspace/backend/internal/checkout"
	appconfig "github.com/suprimkhatri77/cartspace/backend/internal/config"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/emails"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/cloudinary"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/payments"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
)

// Config holds the dependencies route handlers are built from.
type Config struct {
	Config      *appconfig.Config
	Queries     *db.Queries
	CldClient   *cloudinary.Client
	PgxPool     *pgxpool.Pool
	VariantRepo repository.VariantRepository
	CartRepo    repository.CartRepository
	// Payments is nil when Stripe isn't configured; Checkout then answers
	// 503 PAYMENTS_UNAVAILABLE.
	Payments payments.Provider
	Checkout *checkout.Service
	// Mailer is nil when mail isn't configured; password reset then
	// answers 503 MAIL_UNAVAILABLE.
	Mailer emails.Sender
}
