// Command migrate applies the database migrations compiled into it.
//
//	migrate              apply every pending migration (same as "up")
//	migrate up
//	migrate down N       roll back the last N migrations
//	migrate version      print the current version
//	migrate force V      mark version V as applied and clean, after a
//	                     failed migration was fixed by hand
//
// It reads DATABASE_URL from the environment (or ../../.env.local, like the
// server). Exits 1 on any error, so `./migrate up && ./main` never starts
// the server on a schema that failed to migrate.
package main

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"

	"github.com/golang-migrate/migrate/v4"
	"github.com/joho/godotenv"

	appmigrate "github.com/suprimkhatri77/cartspace/backend/internal/migrate"
)

const usage = "usage: migrate [up | down N | version | force V]"

func main() {
	if err := run(os.Args[1:]); err != nil {
		slog.Error("migrate failed", "err", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	_ = godotenv.Load("../../.env.local") // missing in deploys: env comes from the host
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		return errors.New("DATABASE_URL is required")
	}

	command := "up"
	if len(args) > 0 {
		command = args[0]
	}
	// down and force need a number; parse it before touching the database.
	var n int
	switch command {
	case "down", "force":
		if len(args) != 2 {
			return errors.New(usage)
		}
		v, err := strconv.Atoi(args[1])
		if err != nil || v < 0 || (command == "down" && v == 0) {
			return fmt.Errorf("%s: %q is not a valid number (%s)", command, args[1], usage)
		}
		n = v
	case "up", "version":
		if len(args) > 1 {
			return errors.New(usage)
		}
	default:
		return errors.New(usage)
	}

	m, err := appmigrate.New(url)
	if err != nil {
		return err
	}
	defer func() {
		if srcErr, dbErr := m.Close(); srcErr != nil || dbErr != nil {
			slog.Warn("close migrator", "source", srcErr, "database", dbErr)
		}
	}()

	switch command {
	case "up":
		err = m.Up()
	case "down":
		err = m.Steps(-n)
	case "force":
		err = m.Force(n)
	}
	if errors.Is(err, migrate.ErrNoChange) {
		err = nil
		slog.Info("no pending migrations")
	}
	if err != nil {
		return err
	}
	return report(m)
}

// report prints where the database stands after the command.
func report(m *migrate.Migrate) error {
	version, dirty, err := m.Version()
	if errors.Is(err, migrate.ErrNilVersion) {
		slog.Info("database has no migrations applied")
		return nil
	}
	if err != nil {
		return err
	}
	if dirty {
		return fmt.Errorf("database is dirty at version %d: fix the failed migration, then run `migrate force %d` (or the version before it)", version, version)
	}
	slog.Info("database is at", "version", version)
	return nil
}
