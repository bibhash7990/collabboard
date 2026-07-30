# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Single-origin PRODUCTION image: builds the web app + the server, then serves the
# static SPA from the same Node process that hosts the API and WebSocket gateway.
# One URL → no CORS, no cross-site cookies. Used by the Render blueprint.
# (docker-compose.yml still uses the split server/web images for local multi-service.)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm install
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web
# No VITE_API_URL → the client uses same-origin at runtime (see apps/web/src/lib/env.ts).
RUN npm run build -w @collabboard/web && npm run build -w @collabboard/server

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV WEB_DIST=/app/apps/web/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY apps/server/package.json ./apps/server/package.json
COPY package.json ./package.json
EXPOSE 4000
# Render/hosts inject PORT; the server binds to process.env.PORT (see config/env.ts).
CMD ["node", "apps/server/dist/index.js"]
