import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/egraph-visualizer/",
  plugins: [react()],
  build: {
    lib: {
      entry: [resolve(__dirname, "src/anywidget.tsx")],
      formats: ["es"],
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        anywidget: resolve(__dirname, "src/anywidget.tsx"),
      },
    },
  },

  define: {
    "process.env": {},
  },
});
