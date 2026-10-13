// Package migrations holds the database migrations (golang-migrate files,
// also sqlc's schema), compiled into the binaries that run them.
package migrations

import "embed"

// FS is every migration file, embedded so cmd/migrate needs no files on
// disk where it runs.
//
//go:embed *.sql
var FS embed.FS
