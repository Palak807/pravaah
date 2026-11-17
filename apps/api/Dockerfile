# --- build stage ---
FROM node:22-slim AS build
RUN corepack enable && apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# install deps (all workspace manifests first, for layer caching + a valid frozen install)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@nabz/api..."

# sources + build
COPY packages/engine packages/engine
COPY apps/api apps/api
RUN pnpm --filter @nabz/engine build \
  && pnpm --filter @nabz/api prisma:generate \
  && pnpm --filter @nabz/api build

# --- run stage ---
FROM node:22-slim AS run
RUN corepack enable && apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3000
# On start: apply migrations, seed the sample day (idempotent), then serve.
CMD ["sh", "-c", "pnpm prisma:migrate && pnpm seed && node dist/server.js"]
