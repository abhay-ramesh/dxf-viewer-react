import { describe, expect, it } from "bun:test";
import { PointIndex } from "../src/utils/PointIndex";

interface P {
  x: number;
  y: number;
  id: number;
}

/** What the index replaced: compare every point against every other. */
function bruteForceNear(points: P[], x: number, y: number, tolerance: number) {
  return points.filter((p) => Math.hypot(p.x - x, p.y - y) <= tolerance);
}

describe("PointIndex", () => {
  it("finds a point at the query location", () => {
    const index = new PointIndex<P>(0.01);
    index.add({ x: 5, y: 5, id: 1 });
    expect(index.near(5, 5).map((p) => p.id)).toEqual([1]);
  });

  it("finds points within tolerance and rejects those outside", () => {
    const index = new PointIndex<P>(0.1);
    index.addAll([
      { x: 0, y: 0, id: 1 },
      { x: 0.05, y: 0.05, id: 2 }, // ~0.07 away: inside
      { x: 0.2, y: 0, id: 3 }, // 0.2 away: outside
    ]);
    expect(index.near(0, 0).map((p) => p.id).sort()).toEqual([1, 2]);
  });

  it("finds neighbours that fall in an adjacent cell", () => {
    const index = new PointIndex<P>(1);
    // Cell size is 1, so these sit either side of a cell boundary.
    index.add({ x: 0.99, y: 0.99, id: 1 });
    index.add({ x: 1.01, y: 1.01, id: 2 });
    expect(index.near(0.99, 0.99).map((p) => p.id).sort()).toEqual([1, 2]);
  });

  it("works across the origin, where cell indices go negative", () => {
    const index = new PointIndex<P>(0.5);
    index.add({ x: -0.1, y: -0.1, id: 1 });
    index.add({ x: 0.1, y: 0.1, id: 2 });
    expect(index.near(0, 0).map((p) => p.id).sort()).toEqual([1, 2]);
  });

  it("returns nothing when the neighbourhood is empty", () => {
    const index = new PointIndex<P>(0.1);
    index.add({ x: 100, y: 100, id: 1 });
    expect(index.near(0, 0)).toEqual([]);
  });

  it("handles coincident points", () => {
    const index = new PointIndex<P>(0.01);
    index.addAll([
      { x: 3, y: 3, id: 1 },
      { x: 3, y: 3, id: 2 },
      { x: 3, y: 3, id: 3 },
    ]);
    expect(index.near(3, 3).length).toBe(3);
    expect(index.size).toBe(3);
  });

  it("survives a degenerate tolerance", () => {
    const index = new PointIndex<P>(0);
    index.add({ x: 1, y: 1, id: 1 });
    expect(index.near(1, 1).map((p) => p.id)).toEqual([1]);
    expect(index.near(2, 2)).toEqual([]);
  });

  it("clears", () => {
    const index = new PointIndex<P>(1);
    index.add({ x: 0, y: 0, id: 1 });
    index.clear();
    expect(index.size).toBe(0);
    expect(index.near(0, 0)).toEqual([]);
  });

  it("agrees with a brute-force scan on random data", () => {
    const tolerance = 0.75;
    const points: P[] = [];
    // Deterministic pseudo-random so a failure is reproducible.
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 2000; i++) {
      points.push({ x: random() * 100 - 50, y: random() * 100 - 50, id: i });
    }

    const index = new PointIndex<P>(tolerance);
    index.addAll(points);

    for (let i = 0; i < 200; i++) {
      const x = random() * 100 - 50;
      const y = random() * 100 - 50;
      const fromIndex = index
        .near(x, y)
        .map((p) => p.id)
        .sort((a, b) => a - b);
      const fromScan = bruteForceNear(points, x, y, tolerance)
        .map((p) => p.id)
        .sort((a, b) => a - b);
      expect(fromIndex).toEqual(fromScan);
    }
  });

  it("stays fast as the point count grows", () => {
    const build = (count: number) => {
      const index = new PointIndex<P>(0.5);
      for (let i = 0; i < count; i++) {
        index.add({ x: (i % 500) * 0.3, y: Math.floor(i / 500) * 0.3, id: i });
      }
      return index;
    };

    const small = build(2_000);
    const large = build(20_000);

    const time = (index: PointIndex<P>) => {
      const start = performance.now();
      for (let i = 0; i < 2_000; i++) index.near((i % 500) * 0.3, 0.3);
      return performance.now() - start;
    };

    const smallTime = time(small);
    const largeTime = time(large);
    // Ten times the data must not cost anything like ten times the queries.
    // A quadratic scan would; a grid lookup does not.
    expect(largeTime).toBeLessThan(Math.max(smallTime * 4, 40));
  });
});
