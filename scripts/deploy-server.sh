#!/usr/bin/env bash
# Runs on the production server, called by .github/workflows/deploy.yml.
# The images were built on GitHub; this only loads them and restarts.
#
#   scripts/deploy-server.sh <commit-sha> <path-to-images.tar.gz>
#
# If web or api fails its healthcheck, the previous images are put back.
set -euo pipefail

SHA="$1"
IMAGES="$2"
COMPOSE=(docker compose --env-file .env.production -f docker-compose.yml)
SERVICES=(api web)

cd "$(dirname "$0")/.."

echo "==> Checking out $SHA"
git fetch --quiet origin
git checkout --quiet --force "$SHA"

echo "==> Keeping current images as :previous"
for s in "${SERVICES[@]}"; do
  docker image inspect "ohhobastra-$s:latest" >/dev/null 2>&1 &&
    docker tag "ohhobastra-$s:latest" "ohhobastra-$s:previous"
done

echo "==> Loading new images"
gunzip -c "$IMAGES" | docker load
rm -f "$IMAGES"

wait_healthy() {
  local deadline=$((SECONDS + 180))
  for s in "${SERVICES[@]}"; do
    while :; do
      status=$(docker inspect -f '{{.State.Health.Status}}' "ohhobastra-$s" 2>/dev/null || echo missing)
      [ "$status" = healthy ] && break
      if [ "$status" = unhealthy ] || [ $SECONDS -ge $deadline ]; then
        echo "!! ohhobastra-$s is $status"
        return 1
      fi
      sleep 3
    done
  done
}

echo "==> Restarting"
"${COMPOSE[@]}" up -d --no-build --remove-orphans

if wait_healthy; then
  echo "==> Deployed $SHA"
  docker image prune -f >/dev/null
  exit 0
fi

echo "!! Deploy failed, logs:"
for s in "${SERVICES[@]}"; do docker logs --tail 80 "ohhobastra-$s" 2>&1 || true; done

echo "==> Rolling back to previous images"
for s in "${SERVICES[@]}"; do
  docker image inspect "ohhobastra-$s:previous" >/dev/null 2>&1 &&
    docker tag "ohhobastra-$s:previous" "ohhobastra-$s:latest"
done
"${COMPOSE[@]}" up -d --no-build --remove-orphans
exit 1
