import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Pure SPA build for static hosting (e.g. GitHub Pages).
// Run via: bun run build:static
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [tsconfigPaths(), react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
