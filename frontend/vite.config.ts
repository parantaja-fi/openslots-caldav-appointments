import { resolve } from "node:path";
import { defineConfig } from "vite";

// Two entry points, not a router: the emailed link must resolve on plain
// static hosting, with no rewrite rules to get wrong.
export default defineConfig({
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        cancel: resolve(import.meta.dirname, "cancel.html"),
      },
    },
  },
});
