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
/** Click tolerance in screen pixels. */
const PICK_PIXELS = 6;

export class SelectTool implements Tool {
  type = "select" as const;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  constructor(
    private onInfoUpdate?: (info: EntityInfo | null) => void,
    private onHoverUpdate?: (
      info: EntityInfo | null,
      x: number,
      y: number
    ) => void
  ) {}

  activate({ controls }: ToolContext) {
    // A drag belongs to this tool, not to the camera; wheel zoom and
    // space-drag still work.
    controls.dragPanEnabled = false;
  }

  deactivate({ controls, selection }: ToolContext) {
    controls.dragPanEnabled = true;
    selection.setHovered(null);
    selection.clear();
    this.onInfoUpdate?.(null);
    this.onHoverUpdate?.(null, 0, 0);
  }

  /**
   * What is under the cursor.
   *
   * Reads the document's spatial index rather than raycasting the scene: with
   * entities merged into shared buffers there are no per-entity objects to
   * raycast, and the index answers in microseconds regardless of how large
   * the drawing is.
   */
  private pick(
    event: MouseEvent,
    context: ToolContext
  ): IndexedEntity | undefined {
    const { camera, renderer, hitTesting, snapping, viewportHeight } = context;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(ndc, camera);
    const onPlane = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.plane, onPlane);

    // A pick tolerance in pixels, so a hairline is as easy to click when
    // zoomed out as when zoomed in.
    const tolerance = snapping.worldTolerance(
      camera,
      viewportHeight,
      PICK_PIXELS
    );
    return hitTesting.pick(onPlane, tolerance)?.entity;
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
