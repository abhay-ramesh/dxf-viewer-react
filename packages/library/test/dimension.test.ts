import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import { processSolid } from "../src/processors";
import { loadFixture, run } from "./helpers";

describe("DIMENSION", () => {
  it("draws the dimension by expanding its block", async () => {
    const { document } = run(await loadFixture("dimension.dxf"));
    const types = [...document.all()].map((e) => e.type);
    // A dimension is a line, an arrowhead and the measurement text.
    expect(types).toContain("LINE");
    expect(types).toContain("SOLID");
    expect(types).toContain("MTEXT");
  });

  it("shows the measurement, with its escape codes resolved", async () => {
    const { document } = run(await loadFixture("dimension.dxf"));
    expect(document.filter((e) => e.text).map((e) => e.text)).toEqual(["50.00"]);
  });

  it("puts the dimension's parts on the dimension's layer", async () => {
    const { document } = run(await loadFixture("dimension.dxf"));
    for (const entity of document.all()) {
      expect(entity.layer).toBe("DIMS");
    }
  });

  it("records which block each part came from", async () => {
    const { document } = run(await loadFixture("dimension.dxf"));
    for (const entity of document.all()) {
      expect(entity.blockName).toBe("*D1");
    }
  });

  it("reports a dimension whose block is missing rather than dropping it", async () => {
    const { report } = run(await loadFixture("dimension.dxf"));
    const missing = report.all.find((o) => o.reason === "missing-block");
    expect(missing).toBeDefined();
    expect(missing!.type).toBe("DIMENSION");
    expect(missing!.detail).toBe("*MISSING");
  });

  it("counts a drawn dimension as drawn", async () => {
    const { report } = run(await loadFixture("dimension.dxf"));
    expect(report.drawnCount).toBeGreaterThan(0);
  });
});

describe("SOLID", () => {
  const material = new THREE.MeshBasicMaterial();

  it("builds a triangle from three distinct corners", () => {
    const mesh = processSolid(
      {
        type: "SOLID",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 5, y: 10 },
          { x: 5, y: 10 },
        ],
      } as never,
      material
    ) as THREE.Mesh;

    expect(mesh).not.toBeNull();
    expect(mesh.geometry.getAttribute("position").count).toBe(3);
  });

  it("builds two triangles from four distinct corners", () => {
    const mesh = processSolid(
      {
        type: "SOLID",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 0, y: 10 },
          { x: 10, y: 10 },
        ],
      } as never,
      material
    ) as THREE.Mesh;

    expect(mesh.geometry.getAttribute("position").count).toBe(6);
  });

  it("honours DXF's 1-2-4-3 corner order rather than producing a bow-tie", () => {
    // Corners of a unit square, in DXF's order: bottom-left, bottom-right,
    // top-left, top-right. Read naively this crosses itself.
    const mesh = processSolid(
      {
        type: "SOLID",
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
      } as never,
      material
    ) as THREE.Mesh;

    const position = mesh.geometry.getAttribute("position");
    // First triangle is (0,0) (1,0) (0,1) — a corner of the square, not a
    // diagonal sliver through it.
    expect(position.getX(0)).toBe(0);
    expect(position.getY(0)).toBe(0);
    expect(position.getX(1)).toBe(1);
    expect(position.getY(1)).toBe(0);
    expect(position.getX(2)).toBe(0);
    expect(position.getY(2)).toBe(1);
  });

  it("returns nothing for too few points", () => {
    expect(
      processSolid({ type: "SOLID", points: [{ x: 0, y: 0 }] } as never, material)
    ).toBeNull();
    expect(processSolid({ type: "SOLID" } as never, material)).toBeNull();
  });

  it("derives triangles, so it hit-tests as a filled area", async () => {
    const { document } = run(await loadFixture("dimension.dxf"));
    const solid = document.filter((e) => e.type === "SOLID")[0];
    expect(solid.derived.triangles!.length / 6).toBe(1);
    expect(solid.derived.segments.length).toBe(0);
  });
});
