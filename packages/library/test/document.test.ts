import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import { loadDemoFixture, loadFixture, run } from "./helpers";

describe("DxfDocument — identity", () => {
  it("assigns one id per instantiated entity", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const ids = [...document.all()].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    // 5 drawable entities + 1 expanded block line + 3 fill meshes.
    expect(document.size).toBe(9);
  });

  it("round-trips an object back to its entity", async () => {
    const { document, layers } = run(await loadFixture("minimal.dxf"));
    const object = layers["WALLS"].children[0];
    const entity = document.fromObject(object);
    expect(entity).toBeDefined();
    expect(entity!.object).toBe(object);
    expect(document.get(entity!.id)).toBe(entity!);
  });

  it("resolves a hit on a nested child up to the owning entity", async () => {
    const { document, layers } = run(await loadFixture("minimal.dxf"));
    const object = layers["WALLS"].children[0];
    const nested = new THREE.Object3D();
    object.add(nested);
    expect(document.fromObject(nested)?.object).toBe(object);
  });

  it("returns undefined for objects it does not own", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    expect(document.fromObject(new THREE.Object3D())).toBeUndefined();
    expect(document.fromObject(null)).toBeUndefined();
  });

  it("groups ids by layer", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    expect([...document.layerNames].sort()).toEqual(["0", "WALLS"]);
    expect(document.idsOnLayer("WALLS").length).toBe(5);
    expect(document.idsOnLayer("nonexistent")).toEqual([]);
  });

  it("records which block an expanded entity came from", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const fromBlock = document.filter((e) => e.blockName !== undefined);
    expect(fromBlock.length).toBe(1);
    expect(fromBlock[0].blockName).toBe("MARKER");
    expect(fromBlock[0].type).toBe("LINE");
  });

  it("is empty when parsing failed", async () => {
    const { document } = run("not a dxf file");
    expect(document.size).toBe(0);
    expect(document.bounds().isEmpty()).toBe(true);
  });
});

describe("DxfDocument — derived geometry", () => {
  it("computes length for a line in drawing units", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const lines = document.filter(
      (e) => e.type === "LINE" && e.layer === "WALLS"
    );
    const lengths = lines.map((l) => l.derived.length!).sort((a, b) => a - b);
    expect(lengths[0]).toBeCloseTo(5, 5); // (10,0)->(10,5)
    expect(lengths[1]).toBeCloseTo(10, 5); // (0,0)->(10,0)
  });

  it("takes circle centre, radius, area and circumference from the entity", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const circle = document.filter((e) => e.type === "CIRCLE")[0];
    expect(circle.derived.radius).toBe(3);
    expect(circle.derived.center.x).toBeCloseTo(20, 5);
    expect(circle.derived.center.y).toBeCloseTo(20, 5);
    expect(circle.derived.area).toBeCloseTo(Math.PI * 9, 5);
    expect(circle.derived.length).toBeCloseTo(2 * Math.PI * 3, 5);
    expect(circle.derived.closed).toBe(true);
  });

  it("computes area for a closed polyline", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const poly = document.filter((e) => e.type === "LWPOLYLINE")[0];
    // 5 x 5 square from (0,10) to (5,15).
    expect(poly.derived.area).toBeCloseTo(25, 4);
    expect(poly.derived.closed).toBe(true);
  });

  it("applies the INSERT transform to derived geometry", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const blockLine = document.filter((e) => e.blockName === "MARKER")[0];
    // Block-local (0,0)->(2,0), inserted at (50,50).
    expect(blockLine.derived.startPoint!.x).toBeCloseTo(50, 5);
    expect(blockLine.derived.endPoint!.x).toBeCloseTo(52, 5);
    expect(blockLine.derived.length).toBeCloseTo(2, 5);
  });

  it("gives each entity a non-empty bounding box", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    for (const entity of document.all()) {
      expect(entity.derived.bbox.isEmpty()).toBe(false);
    }
  });
});

describe("DxfDocument — coordinate frames", () => {
  it("reports geometry in drawing coordinates, not shifted scene coordinates", async () => {
    const { document, stats } = run(await loadDemoFixture());
    const bounds = document.bounds();
    // The scene graph is translated so the drawing starts at (0,0); the
    // document deliberately is not. These match the file's own header extents.
    expect(bounds.min.x).toBeCloseTo(Number(stats.EXT_MIN_X), 0);
    expect(bounds.min.y).toBeCloseTo(Number(stats.EXT_MIN_Y), 0);
    expect(bounds.max.x).toBeCloseTo(Number(stats.EXT_MAX_X), 0);
  });

  it("converts between document and world space", async () => {
    const { document, stats } = run(await loadDemoFixture());
    expect(document.worldOffset.x).toBeCloseTo(-Number(stats.EXT_MIN_X), 0);

    const documentPoint = new THREE.Vector3(200, 130, 0);
    const world = document.toWorldSpace(documentPoint);
    expect(world.x).not.toBeCloseTo(documentPoint.x, 0);
    expect(document.toDocumentSpace(world).x).toBeCloseTo(documentPoint.x, 5);
  });

  it("indexes every entity in a real drawing", async () => {
    const { document, stats } = run(await loadDemoFixture());
    const lines = document.filter((e) => e.type === "LINE");
    const arcs = document.filter((e) => e.type === "ARC");
    expect(lines.length).toBe(Number(stats.LINE));
    expect(arcs.length).toBe(Number(stats.ARC));
  });
});
