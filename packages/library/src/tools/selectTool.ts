import * as THREE from "three";
import { Tool, ToolContext } from "./types";

interface EntityInfo {
  type: string;
  length?: number;
  radius?: number;
  center?: THREE.Vector3;
  startPoint?: THREE.Vector3;
  endPoint?: THREE.Vector3;
  vertices?: number;
}

export class SelectTool implements Tool {
  type = "select" as const;
  private raycaster = new THREE.Raycaster();
  private selectedObject: THREE.Object3D | null = null;
  private hoveredObject: THREE.Object3D | null = null;
  private originalMaterial: THREE.Material | null = null;
  private hoveredMaterial: THREE.Material | null = null;
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
    if (this.selectedObject && this.originalMaterial) {
      (this.selectedObject as THREE.Line).material = this.originalMaterial;
      this.selectedObject = null;
      this.originalMaterial = null;
      this.onInfoUpdate?.(null);
    }
  }

  private clearHover() {
    if (this.hoveredObject && this.hoveredMaterial) {
      (this.hoveredObject as THREE.Line).material = this.hoveredMaterial;
      this.hoveredObject = null;
      this.hoveredMaterial = null;
      this.onHoverUpdate?.(null, 0, 0);
    }
  }

  private getEntityInfo(object: THREE.Object3D): EntityInfo {
    const info: EntityInfo = {
      type: object.userData.type || "Unknown",
    };

    if (object instanceof THREE.Line) {
      const geometry = object.geometry;
      const positions = geometry.getAttribute("position");

      // Calculate length
      let length = 0;
      for (let i = 0; i < positions.count - 1; i++) {
        const point1 = new THREE.Vector3();
        const point2 = new THREE.Vector3();
        point1.fromBufferAttribute(positions, i);
        point2.fromBufferAttribute(positions, i + 1);
        length += point1.distanceTo(point2);
      }
      info.length = length;

      // Get start and end points
      if (positions.count > 0) {
        const start = new THREE.Vector3();
        start.fromBufferAttribute(positions, 0);
        object.localToWorld(start);
        info.startPoint = start;

        const end = new THREE.Vector3();
        end.fromBufferAttribute(positions, positions.count - 1);
        object.localToWorld(end);
        info.endPoint = end;
      }

      // Get center point
      const center = new THREE.Vector3();
      geometry.computeBoundingSphere();
      if (geometry.boundingSphere) {
        center.copy(geometry.boundingSphere.center);
        object.localToWorld(center);
        info.center = center;
      }

      // Get number of vertices
      info.vertices = positions.count;

      // Get radius if it's a circle/arc
      if (object.userData.type === "CIRCLE" || object.userData.type === "ARC") {
        info.radius = object.userData.radius;
      }
    }

    return info;
  }

  onMouseMove(event: MouseEvent, { camera, renderer, group }: ToolContext) {
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
      intersects[0].object !== this.selectedObject &&
      intersects[0].object !== this.hoveredObject
    ) {
      const newHoverObject = intersects[0].object;
      if (newHoverObject instanceof THREE.Line) {
        // Store original material before setting hover
        this.hoveredObject = newHoverObject;
        this.hoveredMaterial = newHoverObject.material;
        newHoverObject.material = this.hoverMaterial;

        // Get and display hover info
        const info = this.getEntityInfo(newHoverObject);
        this.onHoverUpdate?.(info, event.clientX, event.clientY);
      }
    }
  }

  onMouseDown(event: MouseEvent, { camera, renderer, group }: ToolContext) {
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
      if (newSelection instanceof THREE.Line) {
        // Store original material before setting selection
        this.selectedObject = newSelection;
        this.originalMaterial = newSelection.material;
        newSelection.material = this.highlightMaterial;

        // Get and display entity info
        const info = this.getEntityInfo(newSelection);
        this.onInfoUpdate?.(info);
      }
    }
  }
}
