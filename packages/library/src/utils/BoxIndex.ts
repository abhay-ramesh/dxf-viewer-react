export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Entry<T> extends Box {
  value: T;
}

/**
 * A uniform grid over axis-aligned boxes.
 *
 * {@link PointIndex} answers "which points are near here"; this answers "which
 * boxes contain or come near this point", which is the question hit-testing
 * asks. A box is filed in every cell it overlaps, so a query looks only at the
 * cell under the cursor instead of at every entity in the drawing.
 *
 * Cell size is chosen from the data rather than fixed: too small and a long
 * line is filed in thousands of cells, too large and every query returns the
 * whole drawing.
 */
export class BoxIndex<T> {
  private readonly cells = new Map<number, Entry<T>[]>();
  private cellSize = 1;
  private entries: Entry<T>[] = [];
  private built = false;

  /** Queue a box. Nothing is indexed until {@link build}. */
  add(box: Box, value: T): void {
    this.entries.push({ ...box, value });
    this.built = false;
  }

  /**
   * File every queued box into the grid.
   *
   * @param targetPerCell roughly how many boxes should share a cell. Higher
   * means fewer, larger cells: less memory, more candidates per query.
   */
  build(targetPerCell = 4): void {
    this.cells.clear();
    if (!this.entries.length) {
      this.built = true;
      return;
    }

    // Size cells from the median box, not the mean: one drawing-wide border
    // rectangle should not decide the grid for a thousand small parts.
    const spans = this.entries
      .map((entry) =>
        Math.max(entry.maxX - entry.minX, entry.maxY - entry.minY)
      )
      .sort((a, b) => a - b);
    const median = spans[Math.floor(spans.length / 2)] || 1;
    this.cellSize = Math.max(median * Math.sqrt(targetPerCell), 1e-6);

    for (const entry of this.entries) {
      const minCellX = Math.floor(entry.minX / this.cellSize);
      const maxCellX = Math.floor(entry.maxX / this.cellSize);
      const minCellY = Math.floor(entry.minY / this.cellSize);
      const maxCellY = Math.floor(entry.maxY / this.cellSize);

      // A box spanning an absurd number of cells is filed once, in a bucket
      // every query checks. Cheaper than tens of thousands of insertions.
      const cellCount =
        (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1);
      if (cellCount > 1024) {
        this.pushOversized(entry);
        continue;
      }

      for (let x = minCellX; x <= maxCellX; x++) {
        for (let y = minCellY; y <= maxCellY; y++) {
          this.push(hash(x, y), entry);
        }
      }
    }
    this.built = true;
  }

  /**
   * Every value whose box contains (x, y), expanded by `margin`.
   *
   * Candidates only: the caller still has to test the geometry itself. A
   * bounding box says "worth looking at", not "hit".
   */
  search(x: number, y: number, margin = 0): T[] {
    if (!this.built) this.build();

    const found: T[] = [];
    const seen = new Set<Entry<T>>();

    const minCellX = Math.floor((x - margin) / this.cellSize);
    const maxCellX = Math.floor((x + margin) / this.cellSize);
    const minCellY = Math.floor((y - margin) / this.cellSize);
    const maxCellY = Math.floor((y + margin) / this.cellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
        const bucket = this.cells.get(hash(cellX, cellY));
        if (!bucket) continue;
        for (const entry of bucket) {
          if (seen.has(entry)) continue;
          seen.add(entry);
          if (
            x >= entry.minX - margin &&
            x <= entry.maxX + margin &&
            y >= entry.minY - margin &&
            y <= entry.maxY + margin
          ) {
            found.push(entry.value);
          }
        }
      }
    }

    for (const entry of this.oversized) {
      if (seen.has(entry)) continue;
      if (
        x >= entry.minX - margin &&
        x <= entry.maxX + margin &&
        y >= entry.minY - margin &&
        y <= entry.maxY + margin
      ) {
        found.push(entry.value);
      }
    }

    return found;
  }

  /** Every value whose box overlaps the given box. For marquee selection. */
  searchBox(box: Box): T[] {
    if (!this.built) this.build();

    const found: T[] = [];
    const seen = new Set<Entry<T>>();
    const minCellX = Math.floor(box.minX / this.cellSize);
    const maxCellX = Math.floor(box.maxX / this.cellSize);
    const minCellY = Math.floor(box.minY / this.cellSize);
    const maxCellY = Math.floor(box.maxY / this.cellSize);

    const consider = (entry: Entry<T>) => {
      if (seen.has(entry)) return;
      seen.add(entry);
      if (
        entry.maxX >= box.minX &&
        entry.minX <= box.maxX &&
        entry.maxY >= box.minY &&
        entry.minY <= box.maxY
      ) {
        found.push(entry.value);
      }
    };

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
        this.cells.get(hash(cellX, cellY))?.forEach(consider);
      }
    }
    this.oversized.forEach(consider);
    return found;
  }

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.cells.clear();
    this.entries = [];
    this.oversized = [];
    this.built = false;
  }

  private oversized: Entry<T>[] = [];

  private pushOversized(entry: Entry<T>): void {
    this.oversized.push(entry);
  }

  private push(key: number, entry: Entry<T>): void {
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(entry);
    else this.cells.set(key, [entry]);
  }
}

/** Pack two cell coordinates into one number; collisions are distance-checked. */
function hash(x: number, y: number): number {
  return ((x & 0xffff) << 16) | (y & 0xffff);
}
