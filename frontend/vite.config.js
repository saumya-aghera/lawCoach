import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Built files go to ../backend/frontend/dist so FastAPI can serve them
  build: {
    outDir: "../backend/frontend/dist",
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    // Dev mode: proxy API calls to local backend
    proxy: {
      "/health":           { target: "http://localhost:8080", changeOrigin: true },
      "/prepare":          { target: "http://localhost:8080", changeOrigin: true },
      "/analyze":          { target: "http://localhost:8080", changeOrigin: true },
      "/analyze-document": { target: "http://localhost:8080", changeOrigin: true },
      "/analyze-video":    { target: "http://localhost:8080", changeOrigin: true },
      "/generate-report":  { target: "http://localhost:8080", changeOrigin: true },
      "/laws":             { target: "http://localhost:8080", changeOrigin: true },
    },
  },
});
