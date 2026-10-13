ENV_FILE ?= ../../.env.local

# DATABASE_URL from the environment wins, otherwise it is read from ENV_FILE.
# The shell reads it (instead of make `include` + `export`) so `$` in other
# secrets is never expanded by make. The server loads ENV_FILE itself.
DB_URL = $${DATABASE_URL:-$$(sed -n "s/^DATABASE_URL=//p" $(ENV_FILE) 2>/dev/null | sed "s/^['\"]//; s/['\"]\$$//")}

.PHONY: migrate-up migrate-down sqlc seed run build lint test deps
# cmd/migrate: the same migrator deploys run (the SQL is compiled in).
migrate-up:
	DATABASE_URL="$(DB_URL)" go run ./cmd/migrate up
migrate-down:
	DATABASE_URL="$(DB_URL)" go run ./cmd/migrate down $(N)

# clear old output first: sqlc never deletes files for removed query files
sqlc:
	rm -f internal/database/generated/*.go
	sqlc generate

seed:
	go run ./cmd/seed

run:
	go run ./cmd/server
build:
	go build -o server ./cmd/server
	go build -o migrate ./cmd/migrate

lint:
	golangci-lint run ./...

test:
	go test ./...

deps:
	go mod tidy
	go mod download
