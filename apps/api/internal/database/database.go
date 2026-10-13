package database

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DB wraps the pgx connection pool.
type DB struct {
	Pool *pgxpool.Pool
}

// openPool creates a connection pool and verifies it with a ping.
func openPool(ctx context.Context, config *pgxpool.Config) (*DB, error) {
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &DB{Pool: pool}, nil
}

// Close closes the connection pool.
func (db *DB) Close() {
	if db != nil && db.Pool != nil {
		db.Pool.Close()
	}
}

// ConnectWithRetry connects to postgres, retrying every 2s (e.g. while the
// db container starts). A malformed connection string fails immediately.
func ConnectWithRetry(ctx context.Context, connString string, maxRetries int) (*DB, error) {
	config, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	config.MaxConnIdleTime = 4 * time.Minute
	config.HealthCheckPeriod = 30 * time.Second

	for i := range maxRetries {
		var database *DB
		database, err = openPool(ctx, config)
		if err == nil {
			return database, nil
		}
		slog.Warn("failed to connect to database, retrying...", "attempt", i+1, "max", maxRetries, "err", err)
		if i+1 == maxRetries {
			break
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	return nil, fmt.Errorf("failed to open database after %d attempts: %w", maxRetries, err)
}
