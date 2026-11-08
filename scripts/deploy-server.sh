#!/usr/bin/env bash
# Runs on the production server, called by .github/workflows/deploy.yml.
# The build was made on GitHub; this swaps it in and restarts the services.
# Nothing is built here: the server has 1 GB of RAM.
#
#   scripts/deploy-server.sh <commit-sha> <path-to-build.tgz>
#
# If the api or web fails its health check, the previous build is put back.
set -euo pipefail
export PATH="$HOME/.bun/bin:$PATH"

SHA="$1"
BUILD="$2"
BUILT=(apps/api/dist apps/web/.next)

cd "$(dirname "$0")/.."

echo "==> Checking out $SHA"
git fetch --quiet origin
git checkout --quiet --force "$SHA"

echo "==> Installing packages"
bun install --frozen-lockfile

echo "==> Unpacking new build"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
tar -xzf "$BUILD" -C "$STAGE"
rm -f "$BUILD"

healthy() {
  for _ in $(seq 1 30); do
    curl -fsS http://127.0.0.1:5000/api/v1/health >/dev/null &&
      curl -fsSI http://127.0.0.1:3000/robots.txt >/dev/null && return 0
    sleep 2
  done
  return 1
}

restart() {
  sudo systemctl restart ohhobastra-api ohhobastra-web
}

echo "==> Swapping in new build (old one kept as .previous)"
for d in "${BUILT[@]}"; do
  rm -rf "$d.previous"
  [ -e "$d" ] && mv "$d" "$d.previous"
  mv "$STAGE/$d" "$d"
done

echo "==> Restarting services"
restart

if healthy; then
  echo "==> Deployed $SHA"
  exit 0
fi

echo "!! Health check failed, logs:"
sudo journalctl -u ohhobastra-api -n 60 --no-pager || true
sudo journalctl -u ohhobastra-web -n 60 --no-pager || true

echo "==> Rolling back to previous build"
for d in "${BUILT[@]}"; do
  if [ -e "$d.previous" ]; then
    rm -rf "$d"
    mv "$d.previous" "$d"
  fi
done
restart
healthy && echo "==> Previous build is back up" || echo "!! Previous build is not healthy either"
exit 1
