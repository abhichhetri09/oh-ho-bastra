# Production image for the API. Build from the repo root:
#   docker build -f apps/api/Dockerfile .
# Like the dev image, it runs on Node; Bun is copied in only for installs.
FROM node:24-alpine AS base

COPY --from=oven/bun:1.3.9-alpine /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

# Every workspace manifest, so the frozen lockfile matches. packages/ comes
# whole: the build bundles @repo/types from source.
COPY bun.lock package.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/

FROM base AS build

RUN bun install --frozen-lockfile --filter api

COPY apps/api/ ./apps/api/
RUN cd apps/api && bun run build

# Runtime dependencies only: tsup leaves npm packages external.
FROM base AS deps

RUN bun install --frozen-lockfile --production --filter api

FROM node:24-alpine

ENV NODE_ENV=production

WORKDIR /app/apps/api

# Bun's isolated installs keep packages in /app/node_modules/.bun and link
# them from apps/api/node_modules, so both directories are needed.
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
# Read from the working directory at runtime (MIGRATIONS_DIR, OPENAPI_PATH).
COPY apps/api/migrations ./migrations
COPY apps/api/openapi.json ./

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:5000/api/v1/health || exit 1

# Migrations run first; a failed one stops the container before the API
# starts. exec hands PID 1 to node so SIGTERM reaches its graceful shutdown.
CMD ["sh", "-c", "node dist/migrate.js up && exec node dist/index.js"]
