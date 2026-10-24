# Production image for the storefront. Build from the repo root:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=... .
# Next runs on Node; Bun is copied in only for installs.
FROM node:24-alpine AS base

COPY --from=oven/bun:1.3.9-alpine /usr/local/bin/bun /usr/local/bin/bun

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Every workspace manifest, so the frozen lockfile matches. packages/ comes
# whole: @repo/api-client and @repo/types ship TypeScript source.
COPY bun.lock package.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/

FROM base AS build

RUN bun install --frozen-lockfile --filter @repo/web

COPY apps/web/ ./apps/web/

# NEXT_PUBLIC_* values are inlined into the browser bundle, so they are
# fixed at build time. FRONTEND_URL goes into pages rendered at build time.
ARG NEXT_PUBLIC_API_URL
ARG FRONTEND_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    FRONTEND_URL=$FRONTEND_URL \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone \
    NODE_ENV=production

RUN cd apps/web && bun run build

FROM node:24-alpine

RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app

# The standalone output is a traced server with only the files it needs
# (next.config.ts sets it up when NEXT_OUTPUT=standalone). Static assets and
# public/ are served by it but not copied into it.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:3000/robots.txt || exit 1

CMD ["node", "apps/web/server.js"]
