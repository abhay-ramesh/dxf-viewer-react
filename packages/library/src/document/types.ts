import { IEntity } from "dxf-parser";
import * as THREE from "three";

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
}
