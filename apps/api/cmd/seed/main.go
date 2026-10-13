package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/suprimkhatri77/cartspace/backend/internal/app"
)

func main() {
	ctx := context.Background()

	if err := app.Seed(ctx); err != nil {
		slog.Error("seed failed", "err", err)
		os.Exit(1)
	}
}
