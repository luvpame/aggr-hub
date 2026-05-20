
FROM node:24-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git \
    && curl -fsSL https://vite.plus | bash \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.vite-plus/bin:$PATH"

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ./apps/server/package.json /app/apps/server/package.json

RUN vp install --frozen-lockfile

COPY . .

RUN vp run server#build

FROM node:24-slim

ENV NODE_ENV=production

WORKDIR /app/apps/server

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/server/node_modules ./node_modules
COPY --from=builder /app/apps/server/drizzle-sqlite ./drizzle-sqlite
COPY --from=builder /app/apps/server/dist ./dist

CMD ["node", "dist/index.mjs"]
