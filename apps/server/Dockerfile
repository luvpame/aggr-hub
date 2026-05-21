
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

RUN mkdir -p /tmp/empty-data /tmp/runtime-node_modules \
    && cp -R /app/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 /tmp/runtime-node_modules/better-sqlite3 \
    && cp -R /app/node_modules/.pnpm/bindings@*/node_modules/bindings /tmp/runtime-node_modules/bindings \
    && cp -R /app/node_modules/.pnpm/file-uri-to-path@*/node_modules/file-uri-to-path /tmp/runtime-node_modules/file-uri-to-path

FROM gcr.io/distroless/nodejs24-debian12

ENV NODE_ENV=production

WORKDIR /app/apps/server

COPY --from=builder --chown=nonroot:nonroot /tmp/runtime-node_modules ./node_modules
COPY --from=builder --chown=nonroot:nonroot /app/apps/server/drizzle-sqlite ./drizzle-sqlite
COPY --from=builder --chown=nonroot:nonroot /app/apps/server/dist ./dist
COPY --from=builder --chown=nonroot:nonroot /tmp/empty-data /data

CMD ["dist/index.mjs"]
