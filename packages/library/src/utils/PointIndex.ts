export interface IndexedPoint {
  x: number;
  y: number;
}

/**
 * A uniform spatial hash for "which points are within tolerance of this one".
 *
 * Connectivity analysis asked that question once per endpoint per endpoint,
 * by scanning the whole array — quadratic, and repeated once per tolerance
 * level. Bucketing by a grid whose cell size is the tolerance turns each
 * query into a look at nine cells, which is constant time for the point
 * densities drawings actually have.
 *
 * Cell size equals the tolerance, so any point within tolerance of the query
 * necessarily falls in the query's cell or one of its eight neighbours.
 */
export class PointIndex<T extends IndexedPoint> {
  private readonly cells = new Map<number, T[]>();
  private readonly cellSize: number;

  constructor(private readonly tolerance: number) {
    // A degenerate tolerance would collapse every point into one cell.
    this.cellSize = Math.max(tolerance, Number.EPSILON);
  }

  add(point: T): void {
    const key = hash(
      Math.floor(point.x / this.cellSize),
      Math.floor(point.y / this.cellSize)
    );
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(point);
    else this.cells.set(key, [point]);
  }

  addAll(points: Iterable<T>): void {
    for (const point of points) this.add(point);
  }

  /** Every indexed point within `tolerance` of (x, y). */
  near(x: number, y: number): T[] {
    const found: T[] = [];
    const toleranceSq = this.tolerance * this.tolerance;
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = this.cells.get(hash(cellX + dx, cellY + dy));
        if (!bucket) continue;
        for (const candidate of bucket) {
          const ddx = candidate.x - x;
          const ddy = candidate.y - y;
          if (ddx * ddx + ddy * ddy <= toleranceSq) found.push(candidate);
        }
      }
    }
    return found;
  }

  get size(): number {
    let total = 0;
    for (const bucket of this.cells.values()) total += bucket.length;
    return total;
  }

  clear(): void {
    this.cells.clear();
  }
}

/**
 * Pack two cell coordinates into one number.
 *
 * Cantor-style pairing over a bounded range keeps this allocation-free; a
 * string key would dominate the cost of the lookup it is meant to speed up.
 */
function hash(x: number, y: number): number {
  // 2^16 cells in each direction from the origin, wrapped. Collisions are
  // harmless: candidates are distance-checked anyway.
  return ((x & 0xffff) << 16) | (y & 0xffff);
}
