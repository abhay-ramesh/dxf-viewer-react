import { IEntity } from "dxf-parser";
import * as THREE from "three";
import type { BatchRange } from "../render/BatchBuilder";

/**
 * Stable identity for one instantiated entity, unique within a document.
 *
 * "Instantiated" matters: a block referenced by three INSERTs produces three
 * entities with three ids, all sharing one `source`. Ids are assigned in
 * instantiation order and stay valid for the life of the document, so they are
 * safe to hold in React state, serialise, or hand back to the viewer.
 */
export type EntityId = string;

/**
 * Geometry facts computed once, when the buffers are already in hand.
 *
 * All coordinates are in **document space** — the drawing's own coordinate
 * system, matching what a CAD program would report. See
 * {@link DxfDocument.worldOffset} for the relationship to scene coordinates.
 */
export interface DerivedGeometry {
  bbox: THREE.Box3;
  center: THREE.Vector3;
  /** Curve length for open geometry, perimeter for closed geometry. */
  length?: number;
  area?: number;
  radius?: number;
  startPoint?: THREE.Vector3;
  endPoint?: THREE.Vector3;
  vertexCount?: number;
  closed: boolean;
  /**
   * The entity flattened into disjoint line segments: [ax, ay, bx, by, ...].
   *
   * Hit-testing, snapping and batched rendering all read this rather than the
   * rendered object, which is what lets the renderer merge entities into
   * shared buffers without any of them losing track of which entity is which.
   */
  segments: Float32Array;
  /**
   * A filled area, flattened to triangles: [ax, ay, bx, by, cx, cy, ...].
   *
   * Present instead of segments for generated fills, where "hit" means inside
   * rather than near.
   */
  triangles?: Float32Array;
}

export interface IndexedEntity {
  id: EntityId;
  type: string;
  layer: string;
  /** The parsed DXF entity. Shared between instances of the same block. */
  source: IEntity;
  /** The renderable this entity was instantiated into. */
  object: THREE.Object3D;
  derived: DerivedGeometry;
  /** Identifies the detected closed loop this entity contributes to. */
  loopId?: string;
  /** Present when the entity was instantiated by expanding an INSERT. */
  blockName?: string;
  /** Position in the fill sequence, for palette-style shape colouring. */
  shapeIndex?: number;
  /**
   * The decoded string, for TEXT and MTEXT.
   *
   * Kept on the entity rather than on the rendered object so it survives
   * batching — and so the drawing's text is searchable.
   */
  text?: string;
  /**
   * Where this entity's vertices live inside a shared batch buffer.
   *
   * Present when batching is on, which is what lets selection recolour one
   * entity without giving it its own object or material.
   */
  batchRange?: BatchRange;
}
