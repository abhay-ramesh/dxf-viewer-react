import * as THREE from "three";
import { Tool, ToolContext } from "./types";

export class MeasureTool implements Tool {
  type = "measure" as const;
  private points: THREE.Vector3[] = [];
  private measureLine: THREE.Line | null = null;
  private raycaster = new THREE.Raycaster();
  private snapDistance = 5;
  private snapIndicator: THREE.Mesh | null = null;
  private lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });

  constructor(private onMeasureComplete?: (distance: number) => void) {
    // Create snap indicator
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.snapIndicator = new THREE.Mesh(geometry, material);
    this.snapIndicator.visible = false;
  }

  activate({ controls, scene }: ToolContext) {
    controls.enablePan = false;
    controls.enableRotate = false;
    controls.mouseButtons.LEFT = -1; // No action
    if (this.snapIndicator) {
      scene.add(this.snapIndicator);
    }
  }

  deactivate({ controls, scene }: ToolContext) {
    controls.enablePan = false;
    controls.mouseButtons.LEFT = -1;
    this.points = [];
    if (this.measureLine) {
      scene.remove(this.measureLine);
      this.measureLine = null;
    }
    if (this.snapIndicator) {
      scene.remove(this.snapIndicator);
    }
  }

  private findNearestPoint(
    point: THREE.Vector3,
    group: THREE.Group
  ): THREE.Vector3 | null {
    let nearestPoint = null;
    let minDistance = this.snapDistance;

    group.traverse((object) => {
      if (object instanceof THREE.Line) {
        const positions = object.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          const vertex = new THREE.Vector3();
          vertex.fromBufferAttribute(positions, i);
          object.localToWorld(vertex);

          const distance = point.distanceTo(vertex);
          if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = vertex.clone();
          }
        }
      }
    });

    return nearestPoint;
  }

  onMouseMove(
    event: MouseEvent,
    { camera, renderer, scene, group }: ToolContext
  ) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersectPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, intersectPoint);

    // Find nearest snap point
    const nearestPoint = this.findNearestPoint(intersectPoint, group);

    if (nearestPoint && this.snapIndicator) {
      this.snapIndicator.position.copy(nearestPoint);
      this.snapIndicator.visible = true;
    } else if (this.snapIndicator) {
      this.snapIndicator.visible = false;
    }
  }

  onMouseDown(
    event: MouseEvent,
    { camera, renderer, scene, group }: ToolContext
  ) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersectPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, intersectPoint);

    // Use snapped point if available
    const point =
      this.findNearestPoint(intersectPoint, group) || intersectPoint;
    this.points.push(point);

    if (this.points.length === 2) {
      // Create or update measurement line
      const geometry = new THREE.BufferGeometry().setFromPoints(this.points);

      if (this.measureLine) {
        scene.remove(this.measureLine);
      }

      this.measureLine = new THREE.Line(geometry, this.lineMaterial);
      scene.add(this.measureLine);

      // Calculate and report distance
      const distance = this.points[0].distanceTo(this.points[1]);
      this.onMeasureComplete?.(distance);

      // Reset points for next measurement
      this.points = [];
    }
  }
}
