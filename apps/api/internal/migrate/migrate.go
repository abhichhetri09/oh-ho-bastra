// Package migrate applies the embedded migrations with golang-migrate.
package migrate

import (
	"database/sql"
	"fmt"
	"log/slog"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	pgxmigrate "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" database/sql driver

	"github.com/suprimkhatri77/cartspace/backend/migrations"
)

// New opens a migrator for the database at databaseURL (a postgres:// URL).
// It records versions in schema_migrations, the table the golang-migrate
// CLI uses, so databases the CLI migrated carry on where they were. Each
// run holds a Postgres advisory lock: instances starting together migrate
// once, and the rest wait. Close it when done.
func New(databaseURL string) (*migrate.Migrate, error) {
	source, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return nil, fmt.Errorf("open embedded migrations: %w", err)
	}

	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	driver, err := pgxmigrate.WithInstance(db, &pgxmigrate.Config{})
	if err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("connect to database: %w", err)
	}

	m, err := migrate.NewWithInstance("iofs", source, "pgx5", driver)
	if err != nil {
		_ = driver.Close()
		return nil, fmt.Errorf("create migrator: %w", err)
	}
	m.Log = logger{}
	return m, nil
}

// logger reports each applied migration through slog.
type logger struct{}

func (logger) Printf(format string, v ...any) {
	slog.Info(strings.TrimSpace(fmt.Sprintf(format, v...)))
}

func (logger) Verbose() bool { return false }
