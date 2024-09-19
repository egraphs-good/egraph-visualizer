import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/egraph-visualizer/",
  plugins: [react()],
  build: {
    lib: {
      entry: [resolve(__dirname, "src/anywidget.tsx"), resolve(__dirname, "src/dom.tsx")],
      formats: ["es"],
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        anywidget: resolve(__dirname, "src/anywidget.tsx"),
        dom: resolve(__dirname, "src/dom.tsx"),
      },
    },
  },

  define: {
    "process.env": {
      NODE_ENV: JSON.stringify(process.env.NODE_ENV),
    },
  },
});
