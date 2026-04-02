import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Relative base so one build works for:
// - Custom domains (site at domain root)
// - GitHub Pages project URLs https://<user>.github.io/<repo>/
// Override with VITE_BASE_PATH if needed (e.g. absolute "/my-repo/").
const base = process.env.VITE_BASE_PATH ?? "./";

export default defineConfig({
  plugins: [react()],
  base,
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
