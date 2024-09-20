import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    lib: {
      entry: [resolve(__dirname, "src/Visualizer.tsx")],
      formats: ["es"],
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        index: resolve(__dirname, "src/Visualizer.tsx"),
      },
      // allow extension of entry signatures so Visualizer.tsx can be outputed as index.js and not include any imports
      preserveEntrySignatures: "allow-extension",
    },
  },

  define: {
    "process.env": {
      NODE_ENV: JSON.stringify(process.env.NODE_ENV),
    },
  },
});
