import * as THREE from "three";
import { DxfDocument } from "../document/DxfDocument";
import { EntityId } from "../document/types";
import { paintEntity } from "../render/BatchBuilder";
import { StyleResolver } from "../style/StyleResolver";
import { InteractionState } from "../style/types";

/**
 * What is selected, and what is under the cursor, as data.
 *
 * Selection used to *be* a swapped material: the tool held a
 * `Map<Object3D, Material>` of originals and put them back on clear. That made
 * selection unreadable from outside, unsettable from outside, limited to one
 * entity, and silently corrupt whenever the document was re-processed — the
 * map still referenced objects that no longer existed.
 *
 * Here the set of ids is the truth and the rendering is derived from it, so
 * multi-select, select-by-layer, programmatic selection and change
 * notification all come for free. It also survives batching: when entities
 * share one merged geometry there is no per-object material left to swap, and
 * only a model like this can still express "these are selected".
 */
export class SelectionModel {
  private selected = new Set<EntityId>();
  private hovered: EntityId | null = null;

  /** Materials replaced for display, so the base material can be restored. */
  private readonly baseMaterials = new Map<THREE.Object3D, THREE.Material>();

  constructor(
    private document: DxfDocument,
    private style: StyleResolver,
    private readonly onChange: () => void
  ) {}

  /** Point the model at a newly loaded drawing and drop stale state. */
  retarget(document: DxfDocument, style: StyleResolver): void {
    this.document = document;
    this.style = style;
    this.selected.clear();
    this.hovered = null;
    this.baseMaterials.clear();
  }

  // ------------------------------------------------------------- selection

  get ids(): EntityId[] {
    return [...this.selected];
  }

  get size(): number {
    return this.selected.size;
  }

  has(id: EntityId): boolean {
    return this.selected.has(id);
  }

  /** Replace the selection wholesale. */
  set(ids: Iterable<EntityId>): void {
    const next = new Set([...ids].filter((id) => this.document.get(id)));
    if (sameSet(next, this.selected)) return;
    const previous = this.selected;
    this.selected = next;
    previous.forEach((id) => this.refresh(id));
    next.forEach((id) => this.refresh(id));
    this.onChange();
  }

  add(...ids: EntityId[]): void {
    this.set([...this.selected, ...ids]);
  }

  remove(...ids: EntityId[]): void {
    const next = new Set(this.selected);
    ids.forEach((id) => next.delete(id));
    this.set(next);
  }

  toggle(id: EntityId): void {
    if (this.selected.has(id)) this.remove(id);
    else this.add(id);
  }

  clear(): void {
    this.set([]);
  }

  /** Select every entity on a layer — impossible when selection was a material. */
  selectLayer(layer: string, additive = false): void {
    const ids = this.document.idsOnLayer(layer);
    this.set(additive ? [...this.selected, ...ids] : ids);
  }

  // ----------------------------------------------------------------- hover

  get hoveredId(): EntityId | null {
    return this.hovered;
  }

  setHovered(id: EntityId | null): void {
    if (id === this.hovered) return;
    const previous = this.hovered;
    this.hovered = id && this.document.get(id) ? id : null;
    if (previous) this.refresh(previous);
    if (this.hovered) this.refresh(this.hovered);
  }

  // --------------------------------------------------------------- display

  stateOf(id: EntityId): InteractionState {
    if (this.selected.has(id)) return "selected";
    if (this.hovered === id) return "hover";
    return "normal";
  }

  /**
   * Re-derive one entity's appearance from its state.
   *
   * The base material is remembered the first time an entity is restyled, so
   * returning to "normal" restores exactly what the document built rather
   * than a guess.
   */
  private refresh(id: EntityId): void {
    const entity = this.document.get(id);
    if (!entity) return;

    // Batched: rewrite this entity's slice of the shared colour attribute.
    // Costs that entity's vertices, however many entities share the buffer.
    if (entity.batchRange) {
      paintEntity(entity, entity.batchRange, this.style, this.stateOf(id));
      return;
    }

    const target = entity.object as THREE.Mesh | THREE.Line;
    if (!target.material) return;

    if (!this.baseMaterials.has(target)) {
      this.baseMaterials.set(target, target.material as THREE.Material);
    }

    const state = this.stateOf(id);
    if (state === "normal") {
      const base = this.baseMaterials.get(target);
      if (base) target.material = base;
      return;
    }

    const isFill = target instanceof THREE.Mesh;
    const resolved = this.style.resolve(
      {
        kind: isFill ? "fill" : "stroke",
        type: entity.type,
        layer: entity.layer,
      },
      state
    );
    target.material = isFill
      ? this.style.meshMaterial(resolved)
      : this.style.lineMaterial(resolved);
  }
}

function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}
