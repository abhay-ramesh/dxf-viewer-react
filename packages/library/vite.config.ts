import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: "automatic",
    }),
    dts({
      include: ["src"],
      tsconfigPath: "./tsconfig.json",
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "DxfViewerReact",
      fileName: (format) => `dxf-viewer-react.${format}.js`,
      formats: ["es", "umd"],
    },
    rollupOptions: {
      external: (id) => {
        // Externalize React, React DOM, and all their subpaths
        if (id === "react" || id === "react-dom" || id === "react/jsx-runtime" || id === "react/jsx-dev-runtime") {
          return true;
        }
        // Three.js is now bundled, so don't externalize it
        return false;
      },
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "react/jsx-runtime",
        },
      },
    },
    copyPublicDir: false,
  },
});
