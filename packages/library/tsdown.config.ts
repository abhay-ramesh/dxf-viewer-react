import { defineConfig } from "tsdown";

export default defineConfig({
  // Three entries so a non-React consumer can import the viewer without
  // pulling React into their bundle. "index" stays for back-compatibility.
  entry: ["src/index.ts", "src/core.ts", "src/react.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "three", /^three\//],
  // Bundle Three.js and its addons
  noExternal: ["dxf-parser"],
  treeshake: true,
  minify: false, // Keep readable for debugging
  outDir: "dist",
});

