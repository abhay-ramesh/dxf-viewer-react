import * as THREE from "three";
import { EntityId, IndexedEntity } from "./types";

/**
 * The queryable model of one loaded drawing.
 *
 * Everything downstream — selection, hover, measurement, layer visibility,
 * hit-testing, export — reads from here instead of re-deriving facts from the
 * Three.js scene graph. The scene graph stays a rendering detail.
 */
export class DxfDocument {
  private readonly entities = new Map<EntityId, IndexedEntity>();
  private readonly idByObject = new Map<THREE.Object3D, EntityId>();
  private readonly idsByLayer = new Map<string, EntityId[]>();

  /**
   * Translation applied to the whole drawing so it renders with its
   * bottom-left corner on the world origin: `world = document + worldOffset`.
   *
   * Recording it is what lets the viewer report coordinates in the drawing's
   * own frame rather than in the shifted render frame.
   */
  worldOffset = new THREE.Vector3();

  add(entity: IndexedEntity): void {
    this.entities.set(entity.id, entity);
    this.idByObject.set(entity.object, entity.id);
    const bucket = this.idsByLayer.get(entity.layer);
    if (bucket) bucket.push(entity.id);
    else this.idsByLayer.set(entity.layer, [entity.id]);
  }

  get size(): number {
    return this.entities.size;
  }

  get(id: EntityId): IndexedEntity | undefined {
    return this.entities.get(id);
  }

  /**
   * Resolve a rendered object back to its entity.
   *
   * Only meaningful when batching is off. With batching on, many entities
   * share one object, so this cannot answer the question and picking goes
   * through `HitTester` instead — which is the point: the scene graph stops
   * being the source of truth about identity.
   */
  fromObject(object: THREE.Object3D | null): IndexedEntity | undefined {
    let current: THREE.Object3D | null = object;
    while (current) {
      const id = this.idByObject.get(current);
      if (id !== undefined) return this.entities.get(id);
      current = current.parent;
    }
    return undefined;
  }

  idsOnLayer(layer: string): readonly EntityId[] {
    return this.idsByLayer.get(layer) ?? [];
  }

  get layerNames(): readonly string[] {
    return [...this.idsByLayer.keys()];
  }

  all(): IterableIterator<IndexedEntity> {
    return this.entities.values();
  }

  /**
   * Every text entity whose string contains `query`, case-insensitively.
   *
   * Possible because the decoded string is kept on the entity: a reader can
   * find the callout they are looking for instead of hunting the drawing.
   */
  findText(query: string): IndexedEntity[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return this.filter(
      (entity) => !!entity.text && entity.text.toLowerCase().includes(needle)
    );
  }

  /** Every entity matching a predicate — the basis for select-by-type etc. */
  filter(predicate: (entity: IndexedEntity) => boolean): IndexedEntity[] {
    const out: IndexedEntity[] = [];
    for (const entity of this.entities.values()) {
      if (predicate(entity)) out.push(entity);
    }
    return out;
  }

  /** Scene coordinates -> drawing coordinates. */
  toDocumentSpace(world: THREE.Vector3): THREE.Vector3 {
    return world.clone().sub(this.worldOffset);
  }

  /** Drawing coordinates -> scene coordinates. */
  toWorldSpace(document: THREE.Vector3): THREE.Vector3 {
    return document.clone().add(this.worldOffset);
  }

  /** Bounding box of the whole drawing, in document space. */
  bounds(): THREE.Box3 {
    const box = new THREE.Box3();
    for (const entity of this.entities.values()) {
      if (!entity.derived.bbox.isEmpty()) box.union(entity.derived.bbox);
    }
    return box;
  }
}
