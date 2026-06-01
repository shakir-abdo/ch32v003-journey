# syntax=docker/dockerfile:1.7
#
# Multi-stage Dockerfile for Nuxt 4 (Nitro Node preset). Uses pnpm.
#
# Pass `NUXT_UI_PRO_LICENSE` at build time — Nuxt UI Pro validates it during
# `pnpm install` and `nuxt build`. Use a BuildKit secret to keep it out of
# layers and image history:
#
#   DOCKER_BUILDKIT=1 docker build \
#     --secret id=nuxt_ui_pro_license,src=.env \
#     -t ch32v003-journey .
#
# Or as a build-arg (less secure — ends up in image history):
#
#   docker build --build-arg NUXT_UI_PRO_LICENSE=... -t ch32v003-journey .
#
# Runtime env (set in compose / Dokploy / your orchestrator):
#   - PORT                   (defaults to 3000)
#   - HOST                   (defaults to 0.0.0.0)
#   - NODE_ENV               (auto-set to production by the runner stage)

# ────────────────────────────────────────────────────────────────────────────
# Stage 1: deps — install dependencies via pnpm (matches local development)
# ────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Alpine needs these to compile native modules during install (better-sqlite3,
# sharp, etc.). Cleaned up automatically because this stage is discarded.
RUN apk add --no-cache libc6-compat python3 make g++

# Enable pnpm via corepack (built into Node 16+). No global install needed.
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./

# Allow either --build-arg or BuildKit --secret. The secret approach is
# preferred — it never lands in layers or `docker history`.
ARG NUXT_UI_PRO_LICENSE
RUN --mount=type=secret,id=nuxt_ui_pro_license,required=false \
    --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    if [ -s /run/secrets/nuxt_ui_pro_license ]; then \
        export NUXT_UI_PRO_LICENSE="$(grep -E '^NUXT_UI_PRO_LICENSE=' /run/secrets/nuxt_ui_pro_license | cut -d= -f2-)"; \
    fi; \
    pnpm install --frozen-lockfile --prod=false

# ────────────────────────────────────────────────────────────────────────────
# Stage 2: builder — produce .output/
# ────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable pnpm

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NUXT_UI_PRO_LICENSE
RUN --mount=type=secret,id=nuxt_ui_pro_license,required=false \
    if [ -s /run/secrets/nuxt_ui_pro_license ]; then \
        export NUXT_UI_PRO_LICENSE="$(grep -E '^NUXT_UI_PRO_LICENSE=' /run/secrets/nuxt_ui_pro_license | cut -d= -f2-)"; \
    fi; \
    pnpm build

# ────────────────────────────────────────────────────────────────────────────
# Stage 3: runner — minimal production image
# ────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

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
