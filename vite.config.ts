import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  run: {
    tasks: {
      "dev:up": {
        command: "vp run server#dev & vp run web#dev",
        cache: false,
      },
    },
  },
});
