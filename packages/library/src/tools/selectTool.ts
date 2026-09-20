import * as THREE from "three";
import { SelectionModel } from "../core/SelectionModel";
import { IndexedEntity } from "../document/types";
import { EntityInfo } from "../types";
import { Tool, ToolContext } from "./types";

/**
 * Project an indexed entity into the flat shape the UI consumes.
 *
 * Every value was computed once at document build time, in the drawing's own
 * coordinate system.
 */
export function toEntityInfo(entity: IndexedEntity): EntityInfo {
  const { derived } = entity;
  return {
    type: entity.type,
    layer: entity.layer,
    length: derived.length,
    radius: derived.radius,
    center: derived.center,
    startPoint: derived.startPoint,
    endPoint: derived.endPoint,
    vertices: derived.vertexCount,
    area: derived.area,
  };
}

/**
 * Picking, and nothing else.
 *
 * The tool no longer owns materials, original-material bookkeeping, or the
 * notion of what is selected. It turns a click into a hit and tells the
 * selection model; the model decides what that looks like.
 */
export class SelectTool implements Tool {
  type = "select" as const;
  private raycaster = new THREE.Raycaster();

  constructor(
    private onInfoUpdate?: (info: EntityInfo | null) => void,
    private onHoverUpdate?: (
      info: EntityInfo | null,
      x: number,
      y: number
    ) => void
  ) {}

  activate({ controls }: ToolContext) {
    controls.enablePan = false;
    controls.enableRotate = false;
    controls.mouseButtons.LEFT = null;
  }

  deactivate({ controls, selection }: ToolContext) {
    controls.enablePan = false;
    controls.mouseButtons.LEFT = null;
    selection.setHovered(null);
    selection.clear();
    this.onInfoUpdate?.(null);
    this.onHoverUpdate?.(null, 0, 0);
  }

  private pick(
    event: MouseEvent,
    { camera, renderer, group, document }: ToolContext
  ): IndexedEntity | undefined {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const hits = this.raycaster.intersectObjects(group.children, true);
    return hits.length ? document.fromObject(hits[0].object) : undefined;
  }

  onMouseMove(event: MouseEvent, context: ToolContext) {
    const entity = this.pick(event, context);
    context.selection.setHovered(entity?.id ?? null);
    this.onHoverUpdate?.(
      entity ? toEntityInfo(entity) : null,
      event.clientX,
      event.clientY
    );
  }

  onMouseDown(event: MouseEvent, context: ToolContext) {
    const entity = this.pick(event, context);
    const { selection } = context;

    if (!entity) {
      selection.clear();
      this.onInfoUpdate?.(null);
      return;
    }

    // Shift and Meta extend the selection, the way every editor does.
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    if (additive) selection.toggle(entity.id);
    else selection.set([entity.id]);

    const info = toEntityInfo(entity);
    if (entity.type.startsWith("SHAPE")) info.type = "Closed Loop";
    this.onInfoUpdate?.(selection.has(entity.id) ? info : null);
  }

  /** Expose the model's selection for callers holding only the tool. */
  static selectedIds(selection: SelectionModel): string[] {
    return selection.ids;
  }
}
