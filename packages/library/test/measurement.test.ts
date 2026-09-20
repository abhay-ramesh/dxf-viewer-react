import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import {
  formatMeasurement,
  MeasurementModel,
} from "../src/core/MeasurementModel";
import { SnapService } from "../src/core/SnapService";
import { loadDemoFixture, loadFixture, run } from "./helpers";

function model() {
  let changes = 0;
  const measurements = new MeasurementModel(() => changes++);
  return { measurements, changed: () => changes };
}

describe("MeasurementModel", () => {
  it("keeps every measurement, not just the last", () => {
    const { measurements } = model();
    measurements.add({ x: 0, y: 0 }, { x: 3, y: 4 });
    measurements.add({ x: 0, y: 0 }, { x: 6, y: 8 });
    expect(measurements.count).toBe(2);
    expect(measurements.all.map((m) => m.distance)).toEqual([5, 10]);
  });

  it("computes distance, components and angle", () => {
    const { measurements } = model();
    const m = measurements.add({ x: 1, y: 1 }, { x: 4, y: 5 });
    expect(m.distance).toBeCloseTo(5, 10);
    expect(m.dx).toBe(3);
    expect(m.dy).toBe(4);
    expect(m.angle).toBeCloseTo(53.13, 1);
  });

  it("attaches the drawing's units, which used to be parsed and dropped", () => {
    const { measurements } = model();
    measurements.setUnits("Millimeters");
    const m = measurements.add({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(m.units).toBe("Millimeters");
    expect(formatMeasurement(m)).toBe("10.00 Millimeters");
  });

  it("treats Unitless as no units rather than as a unit name", () => {
    const { measurements } = model();
    measurements.setUnits("Unitless");
    const m = measurements.add({ x: 0, y: 0 }, { x: 2, y: 0 });
    expect(m.units).toBeUndefined();
    expect(formatMeasurement(m)).toBe("2.00");
  });

  it("removes, undoes and clears", () => {
    const { measurements } = model();
    const a = measurements.add({ x: 0, y: 0 }, { x: 1, y: 0 });
    measurements.add({ x: 0, y: 0 }, { x: 2, y: 0 });
    const c = measurements.add({ x: 0, y: 0 }, { x: 3, y: 0 });

    expect(measurements.remove(a.id)).toBe(true);
    expect(measurements.remove("missing")).toBe(false);
    expect(measurements.count).toBe(2);

    expect(measurements.undo()?.id).toBe(c.id);
    expect(measurements.count).toBe(1);

    measurements.clear();
    expect(measurements.count).toBe(0);
  });

  it("notifies on every mutation and not otherwise", () => {
    const { measurements, changed } = model();
    measurements.add({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(changed()).toBe(1);
    measurements.remove("missing");
    expect(changed()).toBe(1);
    measurements.clear();
    expect(changed()).toBe(2);
    measurements.clear(); // Already empty.
    expect(changed()).toBe(2);
  });

  it("totals the recorded distances", () => {
    const { measurements } = model();
    measurements.add({ x: 0, y: 0 }, { x: 3, y: 4 });
    measurements.add({ x: 0, y: 0 }, { x: 0, y: 7 });
    expect(measurements.total).toBe(12);
  });

  it("round-trips through JSON", () => {
    const { measurements } = model();
    measurements.setUnits("Inches");
    measurements.add({ x: 1, y: 2, snappedTo: "endpoint" }, { x: 4, y: 6 });
    const saved = JSON.parse(JSON.stringify(measurements.toJSON()));

    const restored = new MeasurementModel(() => {});
    restored.load(saved);
    expect(restored.count).toBe(1);
    expect(restored.all[0].distance).toBeCloseTo(5, 10);
    expect(restored.all[0].from.snappedTo).toBe("endpoint");
    expect(restored.all[0].units).toBe("Inches");
  });

  it("records points in drawing space, not shifted world space", async () => {
    const { document, stats } = run(await loadDemoFixture());
    const { measurements } = model();

    // Two world-space points; the drawing is translated by -EXTMIN.
    const from = new THREE.Vector3(0, 0, 0);
    const to = new THREE.Vector3(10, 0, 0);
    const m = measurements.addFromWorld(document, from, to);

    expect(m.from.x).toBeCloseTo(Number(stats.EXT_MIN_X), 0);
    expect(m.distance).toBeCloseTo(10, 6);
  });
});

describe("SnapService", () => {
  it("returns nothing without a document", () => {
    const service = new SnapService();
    expect(service.snap(new THREE.Vector3(), 1)).toBeNull();
  });

  it("snaps to an endpoint", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const service = new SnapService();
    service.setDocument(document);

    const line = document.filter(
      (e) => e.type === "LINE" && e.layer === "WALLS"
    )[0];
    const end = document.toWorldSpace(line.derived.endPoint!);

    const snap = service.snap(
      new THREE.Vector3(end.x + 0.2, end.y + 0.2, 0),
      1
    );
    expect(snap).not.toBeNull();
    expect(snap!.point.x).toBeCloseTo(end.x, 5);
    expect(snap!.point.y).toBeCloseTo(end.y, 5);
  });

  it("prefers an endpoint over a midpoint at equal distance", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const service = new SnapService();
    service.setDocument(document);
    const line = document.filter(
      (e) => e.type === "LINE" && e.layer === "WALLS"
    )[0];
    const start = document.toWorldSpace(line.derived.startPoint!);

    const snap = service.snap(start, 50);
    expect(snap?.type).toBe("endpoint");
  });

  it("finds nothing when the cursor is far away", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const service = new SnapService();
    service.setDocument(document);
    expect(service.snap(new THREE.Vector3(9999, 9999, 0), 1)).toBeNull();
  });

  it("honours the requested snap types", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const service = new SnapService();
    service.setDocument(document);
    const circle = document.filter((e) => e.type === "CIRCLE")[0];
    const center = document.toWorldSpace(circle.derived.center);

    const centerSnap = service.snap(center, 1, { types: ["center"] });
    expect(centerSnap?.type).toBe("center");

    const onlyMidpoints = service.snap(center, 1, { types: ["midpoint"] });
    expect(onlyMidpoints).toBeNull();
  });

  it("converts a pixel tolerance into world units for the current zoom", () => {
    const service = new SnapService();
    const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 1000);

    // 100 world units over 500 px => 0.2 world units per px.
    expect(service.worldTolerance(camera, 500, 10)).toBeCloseTo(2, 6);

    // Zooming in halves the world distance a pixel covers. The old fixed
    // 5-world-unit radius did the opposite of this.
    camera.zoom = 2;
    expect(service.worldTolerance(camera, 500, 10)).toBeCloseTo(1, 6);
  });

  it("indexes candidates for a real drawing", async () => {
    const { document } = run(await loadDemoFixture());
    const service = new SnapService();
    service.setDocument(document);
    service.snap(new THREE.Vector3(0, 0, 0), 1);
    expect(service.candidateCount).toBeGreaterThan(1000);
  });
});
