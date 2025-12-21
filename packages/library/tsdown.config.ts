import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  // Bundle Three.js and its addons
  noExternal: ["three", "dxf-parser"],
  treeshake: true,
  minify: false, // Keep readable for debugging
  outDir: "dist",
});

