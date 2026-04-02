import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// GitHub Pages project site: https://<user>.github.io/<repo>/
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base =
  process.env.VITE_BASE_PATH ??
  (process.env.CI && repo ? `/${repo}/` : "/");

export default defineConfig({
  plugins: [react()],
  base,
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
