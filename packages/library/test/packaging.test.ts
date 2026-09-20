import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIST = join(import.meta.dir, "..", "dist");
const built = existsSync(join(DIST, "core.mjs"));

/** Follow an entry's relative imports through the emitted chunks. */
function moduleGraph(entry: string): string[] {
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(join(DIST, file), "utf8");
    for (const match of source.matchAll(/from\s*"\.\/([\w.\-]+\.mjs)"/g)) {
      walk(match[1]);
    }
  };
  walk(entry);
  return [...seen];
}

function bareImports(files: string[]): string[] {
  const found = new Set<string>();
  for (const file of files) {
    const source = readFileSync(join(DIST, file), "utf8");
    for (const match of source.matchAll(/from\s*"([^".][^"]*)"/g)) {
      found.add(match[1]);
    }
  }
  return [...found];
}

describe.skipIf(!built)("packaging", () => {
  it("serves the viewer without React from the /core entry", () => {
    const imports = bareImports(moduleGraph("core.mjs"));
    // The whole point of the split: a Vue, Svelte or plain-HTML consumer
    // should not be told to install React to draw a line.
    expect(imports.filter((name) => name.startsWith("react"))).toEqual([]);
  });

  it("still depends on three, which is a peer dependency", () => {
    const imports = bareImports(moduleGraph("core.mjs"));
    expect(imports.some((name) => name === "three")).toBe(true);
  });

  it("serves the custom element without React either", () => {
    // `<dxf-viewer>` exists so Vue, Svelte, Angular and plain HTML are all
    // covered by one artifact; pulling React in would defeat that.
    const imports = bareImports(moduleGraph("element.mjs"));
    expect(imports.filter((name) => name.startsWith("react"))).toEqual([]);
  });

  it("keeps React in the /react entry, where it belongs", () => {
    const imports = bareImports(moduleGraph("react.mjs"));
    expect(imports.some((name) => name.startsWith("react"))).toBe(true);
  });

  it("declares React as an optional peer dependency", () => {
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")
    );
    expect(manifest.peerDependenciesMeta?.react?.optional).toBe(true);
    expect(manifest.peerDependenciesMeta?.["react-dom"]?.optional).toBe(true);
    // three is genuinely required.
    expect(manifest.peerDependenciesMeta?.three?.optional).toBeUndefined();
  });

  it("exposes all three entry points", () => {
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")
    );
    expect(Object.keys(manifest.exports)).toEqual(
      expect.arrayContaining([".", "./core", "./react", "./element"])
    );
  });
});
