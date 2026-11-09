import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import {fileURLToPath} from "node:url";

const frontRoot=fileURLToPath(new URL(".",import.meta.url));
const sharedRoot=fileURLToPath(new URL("../backend/shared/",import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {allow:[frontRoot,sharedRoot]},
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules') && /[\\/]react(?:-dom|-router|-router-dom)?[\\/]/.test(id)) return 'react-vendor';
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(frontRoot, "src"),
    },
  },
});
