import * as THREE from "three";
import { EntityInfo } from "../types";
import { Tool, ToolContext } from "./types";

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

  private getEntityInfo(object: THREE.Object3D): EntityInfo {
    const info: EntityInfo = {
      type: object.userData.entityType || object.userData.type || "Unknown",
      layer: object.userData.layer || "0",
    };

    if (object.userData.outerArea) {
      info.area = object.userData.outerArea;
    }

    if (object instanceof THREE.Line || object instanceof THREE.LineSegments) {
      const geometry = object.geometry;
      const positions = geometry.getAttribute("position");

      // Calculate length
      let length = 0;
      if (positions) {
        for (let i = 0; i < positions.count - 1; i++) {
          const point1 = new THREE.Vector3();
          const point2 = new THREE.Vector3();
          point1.fromBufferAttribute(positions, i);
          point2.fromBufferAttribute(positions, i + 1);

          // Only add distance if not a line segment break (for THREE.LineSegments)
          if (object instanceof THREE.LineSegments) {
            if (i % 2 === 0) {
              length += point1.distanceTo(point2);
            }
          } else {
            length += point1.distanceTo(point2);
          }
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
        // Get number of vertices
        info.vertices = positions.count;
      }

      // Get center point
      const center = new THREE.Vector3();
      geometry.computeBoundingSphere();
      if (geometry.boundingSphere) {
        center.copy(geometry.boundingSphere.center);
        object.localToWorld(center);
        info.center = center;
      }

      // Get radius if it's a circle/arc (from userData populated in processDxf)
      if (object.userData.radius) {
        info.radius = object.userData.radius;
      }

      // Override center if available in userData (more accurate for circles/arcs)
      if (object.userData.center) {
        const c = new THREE.Vector3(
          object.userData.center.x,
          object.userData.center.y,
          object.userData.center.z || 0
        );
        object.localToWorld(c);
        info.center = c;
      }
    } else if (object instanceof THREE.Mesh) {
      // Handle Shape Meshes (Fills)
      const geometry = object.geometry;
      geometry.computeBoundingSphere();
      if (geometry.boundingSphere) {
        const center = new THREE.Vector3().copy(geometry.boundingSphere.center);
        object.localToWorld(center);
        info.center = center;
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

      // Handle Mesh Selection (Fill/Area)
      if (newSelection instanceof THREE.Mesh) {
        this.selectObject(newSelection);

        // Use perimeter from userData if available
        const info = this.getEntityInfo(newSelection);
        if (newSelection.userData.perimeter) {
          info.length = newSelection.userData.perimeter;
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
        const info = this.getEntityInfo(newSelection);
        this.onInfoUpdate?.(info);
      }
    }
  }
}
