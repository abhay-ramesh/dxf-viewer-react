import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import { aciToRgb, COLOR_BY_BLOCK, COLOR_BY_LAYER } from "../src/style/aci";
import { StyleResolver } from "../src/style/StyleResolver";
import { StyleSubject } from "../src/style/types";
import { batchColorOf, loadDemoFixture, run } from "./helpers";

const stroke = (over: Partial<StyleSubject> = {}): StyleSubject => ({
  kind: "stroke",
  type: "LINE",
  layer: "WALLS",
  ...over,
});

const LAYERS = {
  WALLS: { color: 0xff0000, colorIndex: 1 },
  DIMS: { colorIndex: 2 },
  NAMELESS: {},
};

describe("aciToRgb", () => {
  it("returns the exact standard colours", () => {
    expect(aciToRgb(1)).toBe(0xff0000);
    expect(aciToRgb(2)).toBe(0xffff00);
    expect(aciToRgb(3)).toBe(0x00ff00);
    expect(aciToRgb(7)).toBe(0xffffff);
    expect(aciToRgb(255)).toBe(0xffffff);
    expect(aciToRgb(250)).toBe(0x333333);
  });

  it("generates the chromatic range", () => {
    // 10 is the first generated hue at full saturation and value: red.
    expect(aciToRgb(10)).toBe(0xff0000);
    // Each block of 10 advances the hue by 15 degrees.
    expect(aciToRgb(50)).not.toBe(aciToRgb(10));
    for (let i = 10; i <= 249; i++) {
      const rgb = aciToRgb(i);
      expect(rgb).toBeGreaterThanOrEqual(0);
      expect(rgb).toBeLessThanOrEqual(0xffffff);
    }
  });

  it("falls back to white outside the palette", () => {
    expect(aciToRgb(-5)).toBe(0xffffff);
    expect(aciToRgb(999)).toBe(0xffffff);
  });
});

describe("StyleResolver — the ByLayer default", () => {
  it("uses the layer's true colour when the entity has none", () => {
    const resolver = new StyleResolver({}, LAYERS);
    expect(resolver.resolve(stroke()).color).toBe(0xff0000);
  });

  it("falls back to the layer's ACI index when no RGB is present", () => {
    const resolver = new StyleResolver({}, LAYERS);
    expect(resolver.resolve(stroke({ layer: "DIMS" })).color).toBe(0xffff00);
  });

  it("falls back to white for an unknown or colourless layer", () => {
    const resolver = new StyleResolver({}, LAYERS);
    expect(resolver.resolve(stroke({ layer: "NAMELESS" })).color).toBe(0xffffff);
    expect(resolver.resolve(stroke({ layer: "GHOST" })).color).toBe(0xffffff);
  });

  it("does not repeat the old bug of indexing a palette by an RGB value", () => {
    // layer.color 16777215 (white) used to become 0x0000ff via
    // `colors[color % 10]`.
    const resolver = new StyleResolver({}, { W: { color: 0xffffff } });
    expect(resolver.resolve(stroke({ layer: "W" })).color).toBe(0xffffff);
  });
});

describe("StyleResolver — the cascade", () => {
  it("prefers the entity's own colour over the layer's", () => {
    const resolver = new StyleResolver({}, LAYERS);
    expect(resolver.resolve(stroke({ rgb: 0x00ff00 })).color).toBe(0x00ff00);
    expect(resolver.resolve(stroke({ colorIndex: 5 })).color).toBe(0x0000ff);
  });

  it("treats colour index 256 as ByLayer", () => {
    const resolver = new StyleResolver({}, LAYERS);
    const style = resolver.resolve(
      stroke({ colorIndex: COLOR_BY_LAYER, rgb: 0x00ff00 })
    );
    expect(style.color).toBe(0xff0000);
  });

  it("treats colour index 0 as ByBlock and uses the block's colour", () => {
    const resolver = new StyleResolver({}, LAYERS);
    const style = resolver.resolve(
      stroke({ colorIndex: COLOR_BY_BLOCK, blockColor: 0x123456 })
    );
    expect(style.color).toBe(0x123456);
  });

  it("falls back to the layer when a ByBlock entity has no block colour", () => {
    const resolver = new StyleResolver({}, LAYERS);
    expect(
      resolver.resolve(stroke({ colorIndex: COLOR_BY_BLOCK })).color
    ).toBe(0xff0000);
  });

  it("lets an explicit entityColor override the drawing", () => {
    const resolver = new StyleResolver({ entityColor: "#0000ff" }, LAYERS);
    expect(resolver.resolve(stroke({ rgb: 0x00ff00 })).color).toBe(0x0000ff);
  });

  it("lets a per-layer override outrank the global override", () => {
    const resolver = new StyleResolver(
      { entityColor: 0x0000ff, layerColors: { WALLS: 0x00ff00 } },
      LAYERS
    );
    expect(resolver.resolve(stroke()).color).toBe(0x00ff00);
    expect(resolver.resolve(stroke({ layer: "DIMS" })).color).toBe(0x0000ff);
  });

  it("lets interaction state outrank every colour source", () => {
    const resolver = new StyleResolver(
      { entityColor: 0x0000ff, layerColors: { WALLS: 0x00ff00 } },
      LAYERS
    );
    expect(resolver.resolve(stroke(), "selected").color).toBe(0xff0000);
    expect(resolver.resolve(stroke(), "hover").color).toBe(0x00ff00);
  });

  it("uses configured hover and selection colours", () => {
    const resolver = new StyleResolver(
      { hoverColor: "#123456", selectionColor: 0xabcdef },
      LAYERS
    );
    expect(resolver.resolve(stroke(), "hover").color).toBe(0x123456);
    expect(resolver.resolve(stroke(), "selected").color).toBe(0xabcdef);
  });

  it("gives the resolve hook the final say", () => {
    const resolver = new StyleResolver(
      {
        entityColor: 0x0000ff,
        resolve: (subject) =>
          subject.type === "TEXT" ? { color: 0x00ffff } : undefined,
      },
      LAYERS
    );
    expect(resolver.resolve(stroke({ type: "TEXT" })).color).toBe(0x00ffff);
    expect(resolver.resolve(stroke({ type: "LINE" })).color).toBe(0x0000ff);
  });
});

describe("StyleResolver — fills", () => {
  const fill = (index: number): StyleSubject => ({
    kind: "fill",
    type: "SHAPE",
    layer: "WALLS",
    shapeIndex: index,
  });

  it("accepts a single colour", () => {
    const resolver = new StyleResolver({ shapeColors: "#ff00ff" }, LAYERS);
    expect(resolver.resolve(fill(0)).color).toBe(0xff00ff);
    expect(resolver.resolve(fill(7)).color).toBe(0xff00ff);
  });

  it("cycles through a palette", () => {
    const resolver = new StyleResolver(
      { shapeColors: [0x111111, 0x222222] },
      LAYERS
    );
    expect(resolver.resolve(fill(0)).color).toBe(0x111111);
    expect(resolver.resolve(fill(1)).color).toBe(0x222222);
    expect(resolver.resolve(fill(2)).color).toBe(0x111111);
  });

  it("accepts a function of the shape index", () => {
    const resolver = new StyleResolver(
      { shapeColors: (i) => (i % 2 ? 0xaaaaaa : 0xbbbbbb) },
      LAYERS
    );
    expect(resolver.resolve(fill(0)).color).toBe(0xbbbbbb);
    expect(resolver.resolve(fill(1)).color).toBe(0xaaaaaa);
  });

  it("ignores an empty palette and falls through to the layer", () => {
    const resolver = new StyleResolver({ shapeColors: [] }, LAYERS);
    expect(resolver.resolve(fill(0)).color).toBe(0xff0000);
  });

  it("auto-generates distinct colours when none are configured", () => {
    const resolver = new StyleResolver({}, LAYERS);
    const colors = [0, 1, 2, 3, 4].map((i) => resolver.resolve(fill(i)).color);
    expect(new Set(colors).size).toBe(5);
    // Not the layer colour: generated fills are meant to be distinguishable.
    expect(colors).not.toContain(0xff0000);
  });

  it("makes fills translucent and strokes opaque", () => {
    const resolver = new StyleResolver({}, LAYERS);
    expect(resolver.resolve(fill(0)).transparent).toBe(true);
    expect(resolver.resolve(stroke()).transparent).toBe(false);
    expect(resolver.resolve(stroke()).opacity).toBe(1);
  });

  it("does not apply entityColor to fills", () => {
    const resolver = new StyleResolver({ entityColor: 0x0000ff }, LAYERS);
    expect(resolver.resolve(fill(0)).color).not.toBe(0x0000ff);
  });
});

describe("StyleResolver — material sharing", () => {
  it("returns one material per distinct appearance", () => {
    const resolver = new StyleResolver({}, LAYERS);
    const a = resolver.lineMaterial(resolver.resolve(stroke()));
    const b = resolver.lineMaterial(resolver.resolve(stroke()));
    const c = resolver.lineMaterial(resolver.resolve(stroke({ layer: "DIMS" })));

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(resolver.materialCount).toBe(2);
  });

  it("keeps stroke and fill materials separate", () => {
    const resolver = new StyleResolver({}, LAYERS);
    const line = resolver.lineMaterial(resolver.resolve(stroke()));
    const mesh = resolver.meshMaterial(
      resolver.resolve({ kind: "fill", type: "SHAPE", layer: "WALLS" })
    );
    expect(line).toBeInstanceOf(THREE.LineBasicMaterial);
    expect(mesh).toBeInstanceOf(THREE.MeshBasicMaterial);
  });

  it("disposes every material it created", () => {
    const resolver = new StyleResolver({}, LAYERS);
    let disposed = 0;
    const material = resolver.lineMaterial(resolver.resolve(stroke()));
    material.addEventListener("dispose", () => disposed++);
    resolver.dispose();
    expect(disposed).toBe(1);
    expect(resolver.materialCount).toBe(0);
  });
});

describe("StyleResolver — in processDxf", () => {
  it("renders the drawing in its own layer colours by default", async () => {
    const { document } = run(await loadDemoFixture());
    const onWhite = document.filter(
      (e) => e.layer === "WHITE" && e.type === "LINE"
    )[0];
    // Layer WHITE is 0xffffff in the file. The old code turned it into blue
    // by indexing a 10-colour array with the RGB value.
    expect(batchColorOf(onWhite)).toBe(0xffffff);
  });

  it("reports true layer colours in the layer table", async () => {
    const { layerTable } = run(await loadDemoFixture());
    expect(layerTable["WHITE"].color).toBe(0xffffff);
    expect(layerTable["RED"].color).toBe(0xff0000);
    expect(layerTable["YELLOW"].color).toBe(0xffff00);
  });

  it("honours an explicit entityColor over the drawing", async () => {
    const { document } = run(await loadDemoFixture(), true, {
      entityColor: 0x0000ff,
    });
    const line = document.filter((e) => e.type === "LINE")[0];
    expect(batchColorOf(line)).toBe(0x0000ff);
  });

  it("bakes colour into vertices, so one material covers the drawing", async () => {
    const { document, group } = run(await loadDemoFixture());
    const materials = new Set<THREE.Material>();
    group.traverse((object) => {
      const material = (object as Partial<THREE.Mesh>).material;
      if (material) materials.add(material as THREE.Material);
    });
    // One per batch: colour now lives in a vertex attribute, so entities of
    // different colours still share a material.
    expect(materials.size).toBe(2);
    expect(document.size).toBeGreaterThan(900);
  });
});

describe("StyleResolver — contrast with the background", () => {
  it("renders white layers as black on a light canvas", () => {
    const resolver = new StyleResolver(
      { backgroundColor: 0xffffff },
      { W: { color: 0xffffff } }
    );
    expect(resolver.resolve(stroke({ layer: "W" })).color).toBe(0x000000);
  });

  it("renders black layers as white on a dark canvas", () => {
    const resolver = new StyleResolver(
      { backgroundColor: 0x000000 },
      { B: { color: 0x000000 } }
    );
    expect(resolver.resolve(stroke({ layer: "B" })).color).toBe(0xffffff);
  });

  it("leaves chromatic colours alone", () => {
    const resolver = new StyleResolver(
      { backgroundColor: 0xffffff },
      { R: { color: 0xffff00 } }
    );
    // Yellow on white is low contrast, but flipping it would be wrong: the
    // drawing said yellow.
    expect(resolver.resolve(stroke({ layer: "R" })).color).toBe(0xffff00);
  });

  it("leaves colours that already contrast alone", () => {
    const resolver = new StyleResolver(
      { backgroundColor: 0xffffff },
      { D: { color: 0x333333 } }
    );
    expect(resolver.resolve(stroke({ layer: "D" })).color).toBe(0x333333);
  });

  it("does nothing when no background is configured", () => {
    const resolver = new StyleResolver({}, { W: { color: 0xffffff } });
    expect(resolver.resolve(stroke({ layer: "W" })).color).toBe(0xffffff);
  });
});
