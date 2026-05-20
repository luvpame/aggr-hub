import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  run: {
    tasks: {
      // === 開発用 ===
      "dev:up": {
        command: "vp run server#dev & vp run web#dev",
        cache: false,
      },
      // === 本番用（全サービス） ===
      "prod:build": {
        command: "docker compose build --no-cache",
        cache: false,
      },
      "prod:up": {
        command: "export $(grep -v '^#' apps/server/.env | xargs) && docker compose up -d",
        cache: false,
      },
      "prod:down": {
        command: "docker compose down",
        cache: false,
      },
      "prod:restart": {
        command: "vp run prod:down && vp run prod:build && vp run prod:up",
        cache: false,
      },
    },
  },
});
