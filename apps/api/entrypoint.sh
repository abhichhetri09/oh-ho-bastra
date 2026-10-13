#!/bin/sh
set -e

# The migrator deploys run too (cmd/migrate, with the SQL compiled in).
echo "Running migrations..."
go run ./cmd/migrate up

echo "Starting air..."
exec air
