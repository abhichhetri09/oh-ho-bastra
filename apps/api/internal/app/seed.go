package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/suprimkhatri77/cartspace/backend/internal/auth"
	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	dbgen "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"golang.org/x/crypto/bcrypt"
)

type seedUser struct {
	Name     string
	Email    string
	Password string
	Role     string
}

// Seed inserts demo users (idempotent). Used by cmd/seed.
// Passwords must be set via SEED_ADMIN_PASSWORD and SEED_CUSTOMER_PASSWORD.
func Seed(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}

	initLogger()

	db, err := initDB(ctx, cfg)
	if err != nil {
		return err
	}
	defer db.Close()

	queries := dbgen.New(db.Pool)

	adminPassword, err := requirePassword("SEED_ADMIN_PASSWORD")
	if err != nil {
		return err
	}
	customerPassword, err := requirePassword("SEED_CUSTOMER_PASSWORD")
	if err != nil {
		return err
	}

	users := []seedUser{
		{
			Name:     envOr("SEED_ADMIN_NAME", "Admin User"),
			Email:    auth.NormalizeEmail(envOr("SEED_ADMIN_EMAIL", "admin@example.com")),
			Password: adminPassword,
			Role:     constants.RoleAdmin,
		},
		{
			Name:     envOr("SEED_CUSTOMER_NAME", "Customer User"),
			Email:    auth.NormalizeEmail(envOr("SEED_CUSTOMER_EMAIL", "customer@example.com")),
			Password: customerPassword,
			Role:     constants.RoleCustomer,
		},
	}

	if strings.EqualFold(users[0].Email, users[1].Email) {
		return fmt.Errorf("SEED_ADMIN_EMAIL and SEED_CUSTOMER_EMAIL must be different")
	}

	for _, u := range users {
		if err := upsertSeedUser(ctx, queries, u); err != nil {
			return err
		}
	}

	slog.Info("seed complete",
		"admin_email", users[0].Email,
		"customer_email", users[1].Email,
	)
	return nil
}

func upsertSeedUser(ctx context.Context, queries *dbgen.Queries, u seedUser) error {
	existing, err := queries.GetUserByEmail(ctx, u.Email)
	if err == nil {
		if existing.Role != u.Role {
			slog.Warn("seed user exists with a different role, NOT changing it",
				"email", existing.Email, "role", existing.Role, "seed_role", u.Role)
			return nil
		}
		slog.Info("seed user already exists, skipping", "email", existing.Email, "role", existing.Role)
		return nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("lookup %s: %w", u.Email, err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password for %s: %w", u.Email, err)
	}

	created, err := queries.CreateUser(ctx, dbgen.CreateUserParams{
		Name:         u.Name,
		Email:        u.Email,
		PasswordHash: string(hash),
		Role:         u.Role,
		ImageUrl:     pgtype.Text{Valid: false},
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			slog.Info("seed user already exists (concurrent), skipping", "email", u.Email)
			return nil
		}
		return fmt.Errorf("create %s: %w", u.Email, err)
	}

	slog.Info("seeded user", "email", created.Email, "role", created.Role, "id", uuid.UUID(created.ID.Bytes).String())
	return nil
}

// minPasswordLen matches the register endpoint's validation.
const minPasswordLen = 8

func requirePassword(key string) (string, error) {
	v := os.Getenv(key)
	if strings.TrimSpace(v) == "" {
		return "", fmt.Errorf("%s is required (set it in .env.local before running seed)", key)
	}
	if len(v) < minPasswordLen {
		return "", fmt.Errorf("%s must be at least %d characters", key, minPasswordLen)
	}
	return v, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
