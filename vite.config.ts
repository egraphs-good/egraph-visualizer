import { readFileSync } from "fs";
import { resolve } from "path";
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";

function inlineLibavoidWasm(): Plugin {
  const virtualId = "virtual:libavoid-wasm";
  const resolvedId = "\0" + virtualId;
  return {
    name: "inline-libavoid-wasm",
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id === resolvedId) {
        const wasmPath = resolve(__dirname, "node_modules/libavoid-js/dist/libavoid.wasm");
        const base64 = readFileSync(wasmPath).toString("base64");
        return `export default "data:application/wasm;base64,${base64}";`;
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), inlineLibavoidWasm()],
  worker: {
    plugins: () => [inlineLibavoidWasm()],
  },
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
