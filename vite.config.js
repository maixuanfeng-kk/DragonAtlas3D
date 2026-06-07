import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mars3dPlugin } from "vite-plugin-mars3d";

export default defineConfig({
  plugins: [react(), ...mars3dPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
});
