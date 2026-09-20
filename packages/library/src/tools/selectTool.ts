import * as THREE from "three";
import { DxfDocument } from "../document/DxfDocument";
import { IndexedEntity } from "../document/types";
import { EntityInfo } from "../types";
import { Tool, ToolContext } from "./types";

/**
 * Project an indexed entity into the flat shape the UI consumes.
 *
 * Every value here was computed once at document build time, in the drawing's
 * own coordinate system.
 */
function toEntityInfo(entity: IndexedEntity): EntityInfo {
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

export class SelectTool implements Tool {
  type = "select" as const;
  private raycaster = new THREE.Raycaster();

  // Selection state
  private selectedObjects: THREE.Object3D[] = [];
  private originalMaterials: Map<THREE.Object3D, THREE.Material> = new Map();

  // Hover state
  private hoveredObject: THREE.Object3D | null = null;
  private hoveredMaterial: THREE.Material | null = null;

  // Materials
  private highlightMaterial = new THREE.LineBasicMaterial({
    color: 0xff0000,
    linewidth: 2,
  });
  private hoverMaterial = new THREE.LineBasicMaterial({
    color: 0x00ff00,
    linewidth: 1.5,
    opacity: 0.7,
    transparent: true,
  });
  private meshHighlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    opacity: 0.5,
    transparent: true,
    side: THREE.DoubleSide,
  });
  private meshHoverMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    opacity: 0.5,
    transparent: true,
    side: THREE.DoubleSide,
  });

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
    controls.mouseButtons.LEFT = null; // No action
  }

  deactivate({ controls }: ToolContext) {
    controls.enablePan = false;
    controls.mouseButtons.LEFT = null;

    // Clear any selection
    this.clearSelection();
    // Clear any hover state
    this.clearHover();
  }

  private clearSelection() {
    this.selectedObjects.forEach((object) => {
      const originalMaterial = this.originalMaterials.get(object);
      if (originalMaterial) {
        if (
          object instanceof THREE.Line ||
          object instanceof THREE.LineSegments
        ) {
          object.material = originalMaterial;
        } else if (object instanceof THREE.Mesh) {
          object.material = originalMaterial;
        }
      }
    });
    this.selectedObjects = [];
    this.originalMaterials.clear();
    this.onInfoUpdate?.(null);
  }

  private selectObject(object: THREE.Object3D) {
    if (
      object instanceof THREE.Line ||
      object instanceof THREE.LineSegments ||
      object instanceof THREE.Mesh
    ) {
      if (!this.originalMaterials.has(object)) {
        this.originalMaterials.set(object, object.material as THREE.Material);
      }

      if (object instanceof THREE.Mesh) {
        object.material = this.meshHighlightMaterial;
      } else {
        object.material = this.highlightMaterial;
      }

      this.selectedObjects.push(object);
    }
  }

  private clearHover() {
    if (this.hoveredObject && this.hoveredMaterial) {
      if (
        this.hoveredObject instanceof THREE.Line ||
        this.hoveredObject instanceof THREE.LineSegments
      ) {
        this.hoveredObject.material = this.hoveredMaterial;
      } else if (this.hoveredObject instanceof THREE.Mesh) {
        this.hoveredObject.material = this.hoveredMaterial;
      }
      this.hoveredObject = null;
      this.hoveredMaterial = null;
      this.onHoverUpdate?.(null, 0, 0);
    }
  }

  private getEntityInfo(
    object: THREE.Object3D,
    document: DxfDocument
  ): EntityInfo | null {
    const entity = document.fromObject(object);
    return entity ? toEntityInfo(entity) : null;
  }

  onMouseMove(
    event: MouseEvent,
    { camera, renderer, group, document }: ToolContext
  ) {
    // Get mouse position in normalized device coordinates
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    // Find intersections
    const intersects = this.raycaster.intersectObjects(group.children, true);

    // Clear previous hover if we're not hovering over anything or hovering over a different object
    if (!intersects.length || intersects[0].object !== this.hoveredObject) {
      this.clearHover();
    }

    // Set new hover state if we're hovering over a new object that isn't selected
    if (
      intersects.length > 0 &&
      !this.selectedObjects.includes(intersects[0].object) &&
      intersects[0].object !== this.hoveredObject
    ) {
      const newHoverObject = intersects[0].object;
      if (
        newHoverObject instanceof THREE.Line ||
        newHoverObject instanceof THREE.LineSegments ||
        newHoverObject instanceof THREE.Mesh
      ) {
        // Store original material before setting hover
        this.hoveredObject = newHoverObject;
        this.hoveredMaterial = newHoverObject.material as THREE.Material;

        if (newHoverObject instanceof THREE.Mesh) {
          newHoverObject.material = this.meshHoverMaterial;
        } else {
          newHoverObject.material = this.hoverMaterial;
        }

        // Get and display hover info
        const info = this.getEntityInfo(newHoverObject, document);
        this.onHoverUpdate?.(info, event.clientX, event.clientY);
      }
    }
  }

  onMouseDown(
    event: MouseEvent,
    { camera, renderer, group, document }: ToolContext
  ) {
    // Get mouse position in normalized device coordinates
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    // Find intersections
    const intersects = this.raycaster.intersectObjects(group.children, true);

    // Clear any existing selection
    this.clearSelection();
    // Clear any existing hover
    this.clearHover();

    if (intersects.length > 0) {
      const newSelection = intersects[0].object;

      // Handle Mesh Selection (Fill/Area)
      if (newSelection instanceof THREE.Mesh) {
        this.selectObject(newSelection);

        const info = this.getEntityInfo(newSelection, document);
        if (info) {
          info.type = "Closed Loop"; // Force type for UI
        }

        this.onInfoUpdate?.(info);
        return;
      }

      // Handle Line Selection (Individual Lines)
      if (
        newSelection instanceof THREE.Line ||
        newSelection instanceof THREE.LineSegments
      ) {
        this.selectObject(newSelection);

        // Get and display entity info
        this.onInfoUpdate?.(this.getEntityInfo(newSelection, document));
      }
    }
  }
}
