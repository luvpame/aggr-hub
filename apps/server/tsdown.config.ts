import { defineConfig } from "tsdown";

export default defineConfig({
  deps: {
    alwaysBundle: (id) => id !== "better-sqlite3",
    neverBundle: ["better-sqlite3"],
  },
  entry: ["src/index.ts"],
  format: "esm",
  shims: true,
});
