import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // @fin/shared is a workspace-linked CJS build (tsc, not bundled). Vite serves
  // linked packages' source as-is over /@fs/ by default, skipping the CJS->ESM
  // interop it normally does via esbuild's dependency pre-bundler — so named
  // *value* imports (not just types) silently fail to resolve. Forcing it through
  // optimizeDeps fixes that.
  optimizeDeps: {
    include: ["@fin/shared"],
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
