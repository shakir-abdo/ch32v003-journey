# syntax=docker/dockerfile:1.7
#
# Multi-stage Dockerfile for Nuxt 4 (Nitro Node preset).
#
# Pass `NUXT_UI_PRO_LICENSE` at build time — Nuxt UI Pro validates it during
# `npm install` and `nuxt build`. Use a BuildKit secret to keep it out of
# layers and image history:
#
#   DOCKER_BUILDKIT=1 docker build \
#     --secret id=nuxt_ui_pro_license,src=.env \
#     -t my-nuxt4-app .
#
# Or as a build-arg (less secure — ends up in image history):
#
#   docker build --build-arg NUXT_UI_PRO_LICENSE=... -t my-nuxt4-app .
#
# Runtime env (set in compose / Dokploy / your orchestrator):
#   - PORT                   (defaults to 3000)
#   - HOST                   (defaults to 0.0.0.0)
#   - NODE_ENV               (auto-set to production by the runner stage)

# ────────────────────────────────────────────────────────────────────────────
# Stage 1: deps — install production + dev deps for build
# ────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Alpine needs these to compile native modules during npm install (sharp,
# better-sqlite3, etc.). Cleaned up automatically because this stage is
# discarded.
RUN apk add --no-cache libc6-compat python3 make g++

COPY package.json package-lock.json* ./

# Allow either --build-arg or BuildKit --secret. The secret approach is
# preferred — it never lands in layers or `docker history`.
ARG NUXT_UI_PRO_LICENSE
RUN --mount=type=secret,id=nuxt_ui_pro_license,required=false \
    if [ -s /run/secrets/nuxt_ui_pro_license ]; then \
        export NUXT_UI_PRO_LICENSE="$(grep -E '^NUXT_UI_PRO_LICENSE=' /run/secrets/nuxt_ui_pro_license | cut -d= -f2-)"; \
    fi; \
    npm ci --no-audit --no-fund

# ────────────────────────────────────────────────────────────────────────────
# Stage 2: builder — produce .output/
# ────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NUXT_UI_PRO_LICENSE
RUN --mount=type=secret,id=nuxt_ui_pro_license,required=false \
    if [ -s /run/secrets/nuxt_ui_pro_license ]; then \
        export NUXT_UI_PRO_LICENSE="$(grep -E '^NUXT_UI_PRO_LICENSE=' /run/secrets/nuxt_ui_pro_license | cut -d= -f2-)"; \
    fi; \
    npm run build

# ────────────────────────────────────────────────────────────────────────────
# Stage 3: runner — minimal production image
# ────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Non-root user for the runtime. Alpine has `node` (uid 1000) pre-created
# via the node image — we reuse it instead of creating another user.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# Only the built output is needed at runtime — Nitro bundles its own
# node_modules into .output/server/node_modules
COPY --from=builder --chown=node:node /app/.output ./.output

USER node

EXPOSE 3000

# Built-in healthcheck — hits /api/health (created in server/api/health.get.ts).
# Orchestrators that respect this (Docker, Dokploy) get readiness for free.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --spider --quiet http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["node", ".output/server/index.mjs"]
