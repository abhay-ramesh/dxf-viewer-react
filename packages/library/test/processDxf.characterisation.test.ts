import { describe, expect, it } from "bun:test";
import { loadDemoFixture, loadFixture, renderables, run, worldBox } from "./helpers";

describe("processDxf — minimal fixture", () => {
  it("parses every entity type and counts them", async () => {
    const { stats, entities, parseError } = run(await loadFixture("minimal.dxf"));
    expect(parseError).toBeNull();
    // Source entity list is pre-expansion: the INSERT is still one entity.
    expect(entities.map((e) => e.type).sort()).toEqual([
      "ARC",
      "CIRCLE",
      "INSERT",
      "LINE",
      "LINE",
      "LWPOLYLINE",
    ]);
    // Stats are post-expansion: the INSERT contributes its block's LINE.
    expect(stats.LINE).toBe(3);
    expect(stats.INSERT).toBe(1);
    expect(stats.ARC).toBe(1);
    expect(stats.CIRCLE).toBe(1);
    expect(stats.LWPOLYLINE).toBe(1);
  });

  it("reads the layer table and assigns entities to layer groups", async () => {
    const { layers, layerTable } = run(await loadFixture("minimal.dxf"));
    expect(Object.keys(layers).sort()).toEqual(["0", "WALLS"]);
    expect(layerTable["WALLS"].color).toBeDefined();
    // LINE x2 + LWPOLYLINE live on WALLS; CIRCLE, ARC and the expanded
    // block LINE live on 0. Shape-fill meshes are added into the same layer
    // groups alongside the entity objects, so WALLS also holds the fill(s)
    // generated for its closed polyline.
    // Entities are merged per layer, so a layer holds at most two objects:
    // one batch of strokes and one of fills. Without batching it would hold
    // one object per entity.
    expect(layers["WALLS"].children.length).toBe(2);
    expect(layers["0"].children.length).toBe(2);

    const unbatched = run(await loadFixture("minimal.dxf"), true, {}, false);
    expect(unbatched.layers["WALLS"].children.length).toBe(5);
    expect(unbatched.layers["0"].children.length).toBe(4);
  });

  it("expands INSERT by instantiating block entities with the insert transform", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const blockLine = document.filter((e) => e.blockName === "MARKER")[0];
    expect(blockLine).toBeDefined();
    // Block-local line runs (0,0)->(2,0); inserted at (50,50). Read from the
    // document rather than the scene: the scene is now merged buffers.
    const box = blockLine.derived.bbox;
    expect(box.min.x).toBeCloseTo(50, 5);
    expect(box.max.x).toBeCloseTo(52, 5);
    expect(box.min.y).toBeCloseTo(50, 5);
  });

  it("reports DXF header units", async () => {
    const { stats } = run(await loadFixture("minimal.dxf"));
    expect(stats.DXF_UNITS).toBe("Millimeters");
    expect(stats.DXF_VERSION).toBe("AutoCAD 2007 (AC1021)");
  });

  it("detects the closed LWPOLYLINE as a closed loop", async () => {
    const { stats } = run(await loadFixture("minimal.dxf"));
    expect(Number(stats.TOTAL_CLOSED_LOOPS)).toBeGreaterThanOrEqual(1);
  });

  it("returns an error instead of throwing on unparseable input", async () => {
    const { parseError, entities } = run("not a dxf file");
    expect(parseError).toBeInstanceOf(Error);
    expect(entities).toEqual([]);
  });

  it("returns an empty result for empty input", async () => {
    const { group, entities } = run("");
    expect(entities).toEqual([]);
    expect(group.children.length).toBe(0);
  });
});

describe("processDxf — demo fixture (345 KB, 940 entities)", () => {
  it("produces a stable entity census", async () => {
    const { stats, entities } = run(await loadDemoFixture());
    expect(entities.length).toBe(940);
    expect(stats.LINE).toBe(504);
    expect(stats.ARC).toBe(434);
    expect(stats.CIRCLE).toBe(2);
  });

  it("merges 977 entities into two draw calls", async () => {
    const { group, document } = run(await loadDemoFixture());
    expect(document.size).toBe(977);
    // One stroke batch and one fill batch. Before batching this was 977
    // objects for the same 977 entities.
    expect(renderables(group).length).toBe(2);
  });

  it("still draws one object per entity when batching is off", async () => {
    const { group } = run(await loadDemoFixture(), true, {}, false);
    expect(renderables(group).length).toBe(977);
  });

  it("shifts the drawing so its bottom-left corner sits on the world origin", async () => {
    const { group, stats } = run(await loadDemoFixture());
    const box = worldBox(group);
    // World space is NOT document space: processDxf translates the group by
    // -box.min so the drawing starts at (0,0), and the offset it used is not
    // reported anywhere. Every coordinate the viewer hands back (selection
    // centre/start/end, measurements) is therefore in this shifted frame.
    expect(box.min.x).toBeCloseTo(0, 5);
    expect(box.min.y).toBeCloseTo(0, 5);
    // The drawing's size still matches the header extents.
    const extWidth = Number(stats.EXT_MAX_X) - Number(stats.EXT_MIN_X);
    expect(box.max.x).toBeCloseTo(extWidth, 0);
  });

  it("finds closed loops and holes", async () => {
    const { stats } = run(await loadDemoFixture());
    expect(stats.TOTAL_CLOSED_LOOPS).toBe(73);
    expect(stats.SHAPES_WITH_HOLES).toBe(37);
  });

  it("omits shape fills when showShapeColors is false", async () => {
    const withFills = run(await loadDemoFixture(), true);
    const without = run(await loadDemoFixture(), false);
    expect(without.document.size).toBeLessThan(withFills.document.size);
    // One batch instead of two: strokes only.
    expect(renderables(without.group).length).toBe(1);
  });
});
