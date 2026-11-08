#!/usr/bin/env bash
# Runs on the production server, called by the Migrate job in
# .github/workflows/deploy.yml after it checks out the commit being deployed.
# Applies pending migrations from source (no build needed), using
# DATABASE_URL from .env.production. Runs before the new code goes live.
set -euo pipefail
export PATH="$HOME/.bun/bin:$PATH"

cd "$(dirname "$0")/.."

echo "==> Installing packages"
bun install --frozen-lockfile

echo "==> Migrating database"
set -a; . ./.env.production; set +a
cd apps/api
bun run migrate up
