import * as THREE from "three";
import { DxfDocument } from "../document/DxfDocument";
import { IndexedEntity } from "../document/types";
import { BoxIndex } from "../utils/BoxIndex";

export interface Hit {
  entity: IndexedEntity;
  /** Distance from the query point to the geometry, in document units. */
  distance: number;
  /** True when the point is inside a filled area rather than near a line. */
  inside: boolean;
}

/**
 * Finding the entity under the cursor, without asking the renderer.
 *
 * Picking used to be `raycaster.intersectObjects(group.children, true)`, which
 * walks every rendered object on every mouse move. That is survivable at a
 * thousand entities and hopeless at a hundred thousand — but the reason it had
 * to change is structural, not just speed: once entities are merged into
 * shared buffers for batched rendering, there are no per-entity objects left
 * to raycast against.
 *
 * So picking reads the document instead of the scene: a grid over entity
 * bounding boxes narrows the field to a handful, then each candidate's own
 * segments or triangles decide it exactly.
 */
export class HitTester {
  private index = new BoxIndex<IndexedEntity>();
  private document: DxfDocument | null = null;

  setDocument(document: DxfDocument): void {
    this.document = document;
    this.index = new BoxIndex<IndexedEntity>();

    for (const entity of document.all()) {
      const box = entity.derived.bbox;
      if (box.isEmpty()) continue;
      this.index.add(
        { minX: box.min.x, minY: box.min.y, maxX: box.max.x, maxY: box.max.y },
        entity
      );
    }
    this.index.build();
  }

  get candidateCount(): number {
    return this.index.size;
  }

  /**
   * The nearest entity within `tolerance` of a world-space point.
   *
   * Fills win over strokes when the point is inside one, because clicking the
   * middle of a filled part should select the part rather than whatever line
   * happens to pass nearby.
   */
  pick(
    world: THREE.Vector3,
    tolerance: number,
    filter?: (entity: IndexedEntity) => boolean
  ): Hit | null {
    if (!this.document) return null;

    // Document space is where the geometry lives; the cursor arrives in world
    // space, and the document records exactly that offset.
    const point = this.document.toDocumentSpace(world);
    const candidates = this.index.search(point.x, point.y, tolerance);

    let best: Hit | null = null;
    for (const entity of candidates) {
      if (filter && !filter(entity)) continue;

      const { triangles, segments } = entity.derived;
      if (triangles && triangles.length) {
        if (pointInTriangles(point.x, point.y, triangles)) {
          // Among overlapping fills, the smallest wins: a hole cut into a
          // part is more specific than the part around it.
          const area = entity.derived.area ?? Infinity;
          if (!best?.inside || area < (best.entity.derived.area ?? Infinity)) {
            best = { entity, distance: 0, inside: true };
          }
        }
        continue;
      }

      if (best?.inside) continue; // A fill already claimed this point.

      const distance = distanceToSegments(point.x, point.y, segments);
      if (distance <= tolerance && (!best || distance < best.distance)) {
        best = { entity, distance, inside: false };
      }
    }

    return best;
  }

  /** Every entity whose bounding box meets a world-space rectangle. */
  pickBox(min: THREE.Vector3, max: THREE.Vector3): IndexedEntity[] {
    if (!this.document) return [];
    const a = this.document.toDocumentSpace(min);
    const b = this.document.toDocumentSpace(max);
    return this.index.searchBox({
      minX: Math.min(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxX: Math.max(a.x, b.x),
      maxY: Math.max(a.y, b.y),
    });
  }
}

/** Shortest distance from a point to any segment in a flat pair array. */
export function distanceToSegments(
  x: number,
  y: number,
  segments: Float32Array
): number {
  let best = Infinity;
  for (let i = 0; i + 3 < segments.length; i += 4) {
    const distance = distanceToSegment(
      x,
      y,
      segments[i],
      segments[i + 1],
      segments[i + 2],
      segments[i + 3]
    );
    if (distance < best) best = distance;
  }
  return best;
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);

  // Project onto the segment and clamp, so the ends are handled too.
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Whether a point falls in any triangle of a flat triangle array. */
export function pointInTriangles(
  x: number,
  y: number,
  triangles: Float32Array
): boolean {
  for (let i = 0; i + 5 < triangles.length; i += 6) {
    if (
      pointInTriangle(
        x,
        y,
        triangles[i],
        triangles[i + 1],
        triangles[i + 2],
        triangles[i + 3],
        triangles[i + 4],
        triangles[i + 5]
      )
    ) {
      return true;
    }
  }
  return false;
}

function pointInTriangle(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): boolean {
  // Same-sign cross products mean the point is on the same side of all edges.
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);

  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}
