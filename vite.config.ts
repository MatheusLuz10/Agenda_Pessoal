import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // PGlite (Postgres no navegador, usado só no modo de teste local do
  // DEU SEDE!) carrega seus próprios arquivos .wasm/.data: não pré-empacotar.
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"],
  },
  test: {
    environment: "node",
  },
});
