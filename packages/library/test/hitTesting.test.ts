import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import {
  distanceToSegments,
  HitTester,
  pointInTriangles,
} from "../src/core/HitTester";
import { BoxIndex } from "../src/utils/BoxIndex";
import { loadDemoFixture, loadFixture, run } from "./helpers";

describe("BoxIndex", () => {
  const boxes = [
    { box: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, id: "a" },
    { box: { minX: 5, minY: 5, maxX: 15, maxY: 15 }, id: "b" },
    { box: { minX: 100, minY: 100, maxX: 110, maxY: 110 }, id: "c" },
  ];

  const build = () => {
    const index = new BoxIndex<string>();
    boxes.forEach(({ box, id }) => index.add(box, id));
    index.build();
    return index;
  };

  it("finds the box containing a point", () => {
    expect(build().search(2, 2)).toEqual(["a"]);
  });

  it("finds every overlapping box", () => {
    expect(build().search(7, 7).sort()).toEqual(["a", "b"]);
  });

  it("finds nothing in empty space", () => {
    expect(build().search(50, 50)).toEqual([]);
  });

  it("honours a margin", () => {
    const index = build();
    // (12, 2) is 2 units right of box a and 3 below box b.
    expect(index.search(12, 2)).toEqual([]);
    expect(index.search(12, 2, 2.5)).toEqual(["a"]);
    expect(index.search(12, 2, 3).sort()).toEqual(["a", "b"]);
  });

  it("searches a rectangle for marquee selection", () => {
    const index = build();
    expect(
      index.searchBox({ minX: -5, minY: -5, maxX: 20, maxY: 20 }).sort()
    ).toEqual(["a", "b"]);
    expect(index.searchBox({ minX: 200, minY: 200, maxX: 300, maxY: 300 })).toEqual(
      []
    );
  });

  it("returns each box once even when it spans many cells", () => {
    const index = new BoxIndex<string>();
    index.add({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 }, "wide");
    index.add({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, "small");
    index.build();
    expect(index.search(0.5, 0.5).filter((id) => id === "wide").length).toBe(1);
  });

  it("still finds a box far larger than the grid", () => {
    const index = new BoxIndex<string>();
    // One drawing-wide border plus many small parts: the border spans more
    // cells than it is worth filing individually.
    index.add({ minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 }, "border");
    for (let i = 0; i < 100; i++) {
      index.add({ minX: i, minY: 0, maxX: i + 0.5, maxY: 0.5 }, `part${i}`);
    }
    index.build();
    expect(index.search(3.2, 0.2)).toContain("border");
    expect(index.search(500, 500)).toEqual(["border"]);
  });

  it("builds lazily if the caller forgets", () => {
    const index = new BoxIndex<string>();
    index.add({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, "a");
    expect(index.search(0.5, 0.5)).toEqual(["a"]);
  });

  it("handles an empty index", () => {
    const index = new BoxIndex<string>();
    index.build();
    expect(index.search(0, 0)).toEqual([]);
    expect(index.size).toBe(0);
  });

  it("clears", () => {
    const index = build();
    index.clear();
    expect(index.size).toBe(0);
    expect(index.search(2, 2)).toEqual([]);
  });
});

describe("geometry predicates", () => {
  it("measures distance to a segment, including past its ends", () => {
    const segments = new Float32Array([0, 0, 10, 0]);
    expect(distanceToSegments(5, 3, segments)).toBeCloseTo(3, 10);
    expect(distanceToSegments(-4, 0, segments)).toBeCloseTo(4, 10);
    expect(distanceToSegments(14, 0, segments)).toBeCloseTo(4, 10);
  });

  it("handles a degenerate segment", () => {
    expect(distanceToSegments(3, 4, new Float32Array([0, 0, 0, 0]))).toBeCloseTo(
      5,
      10
    );
  });

  it("returns Infinity for no segments", () => {
    expect(distanceToSegments(0, 0, new Float32Array(0))).toBe(Infinity);
  });

  it("tests point-in-triangle", () => {
    const triangle = new Float32Array([0, 0, 10, 0, 0, 10]);
    expect(pointInTriangles(1, 1, triangle)).toBe(true);
    expect(pointInTriangles(9, 9, triangle)).toBe(false);
    // On an edge counts as inside.
    expect(pointInTriangles(5, 0, triangle)).toBe(true);
  });
});

describe("HitTester", () => {
  it("picks a line by proximity", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const tester = new HitTester();
    tester.setDocument(document);

    const line = document.filter(
      (e) => e.type === "LINE" && e.layer === "WALLS"
    )[0];
    const mid = document.toWorldSpace(line.derived.center);
    const hit = tester.pick(mid, 0.5);
    expect(hit).not.toBeNull();
  });

  it("finds nothing in empty space", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const tester = new HitTester();
    tester.setDocument(document);
    expect(tester.pick(new THREE.Vector3(9999, 9999, 0), 1)).toBeNull();
  });

  it("respects the tolerance", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const tester = new HitTester();
    tester.setDocument(document);

    const line = document.filter((e) => e.type === "LINE")[0];
    const near = document.toWorldSpace(
      line.derived.center.clone().add(new THREE.Vector3(0, 3, 0))
    );
    expect(tester.pick(near, 0.5)).toBeNull();
    expect(tester.pick(near, 5)).not.toBeNull();
  });

  it("prefers a fill when the point is inside one", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const tester = new HitTester();
    tester.setDocument(document);

    const fill = document.filter((e) => e.type.startsWith("SHAPE"))[0];
    const inside = document.toWorldSpace(fill.derived.center);
    const hit = tester.pick(inside, 1);
    expect(hit?.inside).toBe(true);
  });

  it("applies a filter", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const tester = new HitTester();
    tester.setDocument(document);

    const circle = document.filter((e) => e.type === "CIRCLE")[0];
    const onCircle = document.toWorldSpace(
      circle.derived.center.clone().add(new THREE.Vector3(3, 0, 0))
    );
    expect(tester.pick(onCircle, 1, (e) => e.type === "LINE")).toBeNull();
    expect(tester.pick(onCircle, 1, (e) => e.type === "CIRCLE")).not.toBeNull();
  });

  it("selects a rectangle of entities", async () => {
    const { document } = run(await loadDemoFixture());
    const tester = new HitTester();
    tester.setDocument(document);

    const bounds = document.bounds();
    const all = tester.pickBox(
      document.toWorldSpace(bounds.min),
      document.toWorldSpace(bounds.max)
    );
    expect(all.length).toBe(document.size);
  });

  it("agrees with raycasting on a real drawing", async () => {
    // Raycasting needs one object per entity to compare against, so this
    // runs unbatched — the point is that the new picking path finds the same
    // entities the old one did.
    const { document, group } = run(await loadDemoFixture(), true, {}, false);
    group.updateMatrixWorld(true);

    const tester = new HitTester();
    tester.setDocument(document);

    // Raycast the same points the old picking path would have.
    const camera = new THREE.OrthographicCamera(-400, 400, 300, -300, 0.1, 1000);
    camera.position.set(400, 250, 100);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 1 };

    let compared = 0;
    let agreed = 0;
    for (let i = 0; i < 300; i++) {
      const ndcX = (i / 300) * 2 - 1;
      const ndcY = (((i * 13) % 300) / 300) * 2 - 1;
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const rayHits = raycaster.intersectObjects(group.children, true);
      if (!rayHits.length) continue;

      const rayEntity = document.fromObject(rayHits[0].object);
      if (!rayEntity) continue;

      const hit = tester.pick(rayHits[0].point, 1);
      compared++;
      // Either the same entity, or one whose geometry is at least as close —
      // overlapping fills legitimately give the two methods different but
      // equally valid answers.
      if (hit && (hit.entity.id === rayEntity.id || hit.inside)) agreed++;
    }

    expect(compared).toBeGreaterThan(50);
    expect(agreed / compared).toBeGreaterThan(0.9);
  });

  it("indexes every entity with geometry", async () => {
    const { document } = run(await loadDemoFixture());
    const tester = new HitTester();
    tester.setDocument(document);
    expect(tester.candidateCount).toBe(document.size);
  });
});
