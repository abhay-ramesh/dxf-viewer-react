import * as THREE from "three";
import { DxfDocument } from "../document/DxfDocument";
import { EntityId, IndexedEntity } from "../document/types";
import { SnapPoint, SnapType } from "../types";
import { PointIndex } from "../utils/PointIndex";

interface Candidate {
  x: number;
  y: number;
  z: number;
  type: SnapType;
  entityId: EntityId;
}

export interface SnapOptions {
  /**
   * How close the cursor must be, **in screen pixels**.
   *
   * The old implementation used 5 world units, so snapping got easier the
   * further you zoomed out and became unusable when you zoomed in. A
   * tolerance the user can feel has to be expressed in what the user sees.
   */
  pixels?: number;
  /** Which kinds of point to snap to. Order does not imply priority. */
  types?: SnapType[];
}

const DEFAULT_TYPES: SnapType[] = [
  "endpoint",
  "midpoint",
  "center",
  "quadrant",
  "intersection",
  "nearest",
];

/**
 * Lower wins. A corner is almost always what someone meant over the middle
 * of the same segment, and "nearest point on the line" is the last resort.
 */
const PRIORITY: Record<SnapType, number> = {
  endpoint: 1,
  center: 1,
  intersection: 1,
  quadrant: 2,
  midpoint: 2,
  nearest: 3,
};

/**
 * Finding the significant point nearest the cursor.
 *
 * This used to be a static helper that only the measure tool called, which
 * re-walked every candidate object's buffers on every mouse move and compared
 * against a hardcoded 5-world-unit radius. Snapping is the substrate for
 * every precision feature — measuring, dimensioning, drawing, alignment — so
 * it belongs on the core, computed once per document and queried in constant
 * time.
 */
export class SnapService {
  private index: PointIndex<Candidate> | null = null;
  private document: DxfDocument | null = null;
  private builtWithTolerance = 0;

  /** Discard the cached index. Called whenever the drawing changes. */
  invalidate(): void {
    this.index = null;
  }

  setDocument(document: DxfDocument): void {
    this.document = document;
    this.invalidate();
  }

  /**
   * Convert a screen-pixel tolerance into world units for this camera.
   *
   * For an orthographic camera the visible world height is
   * (top - bottom) / zoom, so one pixel is that over the viewport height.
   */
  worldTolerance(
    camera: THREE.OrthographicCamera,
    viewportHeight: number,
    pixels: number
  ): number {
    if (viewportHeight <= 0) return pixels;
    const worldHeight = (camera.top - camera.bottom) / camera.zoom;
    return (worldHeight / viewportHeight) * pixels;
  }

  /**
   * The best snap near a world-space point, or null.
   *
   * @param tolerance world-space radius, from {@link worldTolerance}
   */
  snap(
    world: THREE.Vector3,
    tolerance: number,
    options: SnapOptions = {}
  ): SnapPoint | null {
    if (!this.document) return null;
    const allowed = new Set(options.types ?? DEFAULT_TYPES);

    // The grid's cell size is its tolerance, so rebuild when the zoom has
    // moved enough to matter rather than on every frame.
    if (
      !this.index ||
      tolerance > this.builtWithTolerance * 2 ||
      tolerance < this.builtWithTolerance / 2
    ) {
      this.build(tolerance);
    }

    const near = this.index!.near(world.x, world.y).filter((candidate) =>
      allowed.has(candidate.type)
    );
    if (!near.length) return null;

    let best: Candidate | null = null;
    let bestDistance = Infinity;
    let bestPriority = Infinity;

    for (const candidate of near) {
      const distance = Math.hypot(candidate.x - world.x, candidate.y - world.y);
      const priority = PRIORITY[candidate.type] ?? 3;
      if (
        priority < bestPriority ||
        (priority === bestPriority && distance < bestDistance)
      ) {
        best = candidate;
        bestPriority = priority;
        bestDistance = distance;
      }
    }

    if (!best) return null;
    return {
      point: new THREE.Vector3(best.x, best.y, best.z),
      type: best.type,
      distance: bestDistance,
    };
  }

  /** Candidate count, for tests and diagnostics. */
  get candidateCount(): number {
    return this.index?.size ?? 0;
  }

  private build(tolerance: number): void {
    const index = new PointIndex<Candidate>(Math.max(tolerance, 1e-6));
    this.builtWithTolerance = Math.max(tolerance, 1e-6);

    if (this.document) {
      const offset = this.document.worldOffset;
      for (const entity of this.document.all()) {
        for (const candidate of candidatesFor(entity, offset)) {
          index.add(candidate);
        }
      }
    }
    this.index = index;
  }
}

/**
 * Significant points of one entity, in world space.
 *
 * World rather than document space because this answers a question about
 * where the cursor is, and the cursor arrives in world coordinates.
 */
function candidatesFor(
  entity: IndexedEntity,
  worldOffset: THREE.Vector3
): Candidate[] {
  const out: Candidate[] = [];
  const object = entity.object as THREE.Line | THREE.Mesh;
  const geometry = object.geometry;
  if (!geometry) return out;

  const push = (point: THREE.Vector3, type: SnapType) => {
    out.push({ x: point.x, y: point.y, z: point.z, type, entityId: entity.id });
  };

  const positions = geometry.getAttribute("position");
  if (positions) {
    object.updateMatrixWorld();
    const isLoop = object instanceof THREE.LineLoop;
    const stride = object instanceof THREE.LineSegments ? 2 : 1;

    const at = (i: number) =>
      new THREE.Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(object.matrixWorld);

    for (let i = 0; i < positions.count; i++) push(at(i), "endpoint");

    const segments = isLoop ? positions.count : positions.count - 1;
    for (let i = 0; i < segments; i += stride) {
      const a = at(i);
      const b = at((i + 1) % positions.count);
      push(a.clone().add(b).multiplyScalar(0.5), "midpoint");
    }
  }

  const { radius, center } = entity.derived;
  if (center && typeof radius === "number") {
    // Derived geometry is in document space; the cursor arrives in world
    // space. The document records exactly this translation, so there is no
    // need to go fishing in the scene graph for it.
    const worldCenter = center.clone().add(worldOffset);
    push(worldCenter, "center");
    push(new THREE.Vector3(worldCenter.x + radius, worldCenter.y, worldCenter.z), "quadrant");
    push(new THREE.Vector3(worldCenter.x - radius, worldCenter.y, worldCenter.z), "quadrant");
    push(new THREE.Vector3(worldCenter.x, worldCenter.y + radius, worldCenter.z), "quadrant");
    push(new THREE.Vector3(worldCenter.x, worldCenter.y - radius, worldCenter.z), "quadrant");
  }

  return out;
}
