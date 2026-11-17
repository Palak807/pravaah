# --- build stage ---
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@nabz/web..."

COPY packages/engine packages/engine
COPY apps/web apps/web
RUN pnpm --filter @nabz/engine build && pnpm --filter @nabz/web build

# --- run stage: static files served by nginx, /api proxied to the api container ---
FROM nginx:alpine AS run
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
# Ensure nginx (non-root) can read every asset, including fonts copied with
# restrictive source permissions (otherwise /fonts/*.woff2 returns 403).
RUN chmod -R a+rX /usr/share/nginx/html
EXPOSE 80
