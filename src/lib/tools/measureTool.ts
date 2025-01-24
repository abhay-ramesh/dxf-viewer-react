import * as THREE from "three";
import { Tool, ToolContext } from "./types";

export class MeasureTool implements Tool {
  type = "measure" as const;
  private points: THREE.Vector3[] = [];
  private measureLine: THREE.Line | null = null;
  private tempLine: THREE.Line | null = null;
  private raycaster = new THREE.Raycaster();
  private snapDistance = 5;
  private snapIndicator: THREE.Mesh | null = null;
  private startPoint: THREE.Mesh | null = null;
  private endPoint: THREE.Mesh | null = null;
  private lineMaterial = new THREE.LineBasicMaterial({
    color: 0xff0000,
    linewidth: 2,
  });
  private tempLineMaterial = new THREE.LineBasicMaterial({
    color: 0xff0000,
    opacity: 0.5,
    transparent: true,
    linewidth: 1,
  });
  private pointMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
  });
  private snapMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    opacity: 1,
    transparent: false,
    depthTest: false,
  });

  constructor(
    private onMeasureComplete?: (distance: number) => void,
    private onMeasureUpdate?: (
      distance: number | null,
      x: number,
      y: number
    ) => void
  ) {
    // Create snap indicator - larger and more visible
    const snapGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    this.snapIndicator = new THREE.Mesh(snapGeometry, this.snapMaterial);
    this.snapIndicator.visible = false;
    this.snapIndicator.renderOrder = 999; // Ensure it renders on top

    // Create point indicators
    const pointGeometry = new THREE.SphereGeometry(0.8, 16, 16);
    this.startPoint = new THREE.Mesh(pointGeometry, this.pointMaterial);
    this.endPoint = new THREE.Mesh(pointGeometry, this.pointMaterial);
    this.startPoint.visible = false;
    this.endPoint.visible = false;
  }

  activate({ controls, scene }: ToolContext) {
    controls.enablePan = false;
    controls.enableRotate = false;
    controls.mouseButtons.LEFT = -1;

    // Add visual elements to scene
    if (this.snapIndicator) scene.add(this.snapIndicator);
    if (this.startPoint) scene.add(this.startPoint);
    if (this.endPoint) scene.add(this.endPoint);
  }

  deactivate({ controls, scene }: ToolContext) {
    controls.enablePan = false;
    controls.mouseButtons.LEFT = -1;
    this.points = [];

    // Clean up visual elements
    if (this.measureLine) {
      scene.remove(this.measureLine);
      this.measureLine = null;
    }
    if (this.tempLine) {
      scene.remove(this.tempLine);
      this.tempLine = null;
    }
    if (this.snapIndicator) {
      scene.remove(this.snapIndicator);
    }
    if (this.startPoint) {
      scene.remove(this.startPoint);
      this.startPoint.visible = false;
    }
    if (this.endPoint) {
      scene.remove(this.endPoint);
      this.endPoint.visible = false;
    }
    this.onMeasureUpdate?.(null, 0, 0);
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
    const currentPoint = nearestPoint || intersectPoint;

    // Update snap indicator
    if (this.snapIndicator) {
      this.snapIndicator.position.copy(currentPoint);
      this.snapIndicator.visible = true;
    }

    // Update temporary line if we have a start point
    if (this.points.length === 1) {
      const linePoints = [this.points[0], currentPoint];
      const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);

      if (this.tempLine) {
        scene.remove(this.tempLine);
      }

      this.tempLine = new THREE.Line(geometry, this.tempLineMaterial);
      scene.add(this.tempLine);

      // Calculate and display current distance
      const distance = this.points[0].distanceTo(currentPoint);
      this.onMeasureUpdate?.(
        Number(distance.toFixed(2)),
        event.clientX,
        event.clientY - 20
      );
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

    if (this.points.length === 1) {
      // First point - show start indicator
      if (this.startPoint) {
        this.startPoint.position.copy(point);
        this.startPoint.visible = true;
      }
    } else if (this.points.length === 2) {
      // Second point - create final measurement
      if (this.endPoint) {
        this.endPoint.position.copy(point);
        this.endPoint.visible = true;
      }

      // Create or update measurement line
      const geometry = new THREE.BufferGeometry().setFromPoints(this.points);

      if (this.measureLine) {
        scene.remove(this.measureLine);
      }
      if (this.tempLine) {
        scene.remove(this.tempLine);
        this.tempLine = null;
      }

      this.measureLine = new THREE.Line(geometry, this.lineMaterial);
      scene.add(this.measureLine);

      // Calculate and report distance
      const distance = this.points[0].distanceTo(this.points[1]);
      this.onMeasureComplete?.(Number(distance.toFixed(2)));
      this.onMeasureUpdate?.(null, 0, 0);

      // Reset points for next measurement
      this.points = [];

      // Hide point indicators after a delay
      setTimeout(() => {
        if (this.startPoint) this.startPoint.visible = false;
        if (this.endPoint) this.endPoint.visible = false;
        if (this.measureLine && scene) {
          scene.remove(this.measureLine);
          this.measureLine = null;
        }
      }, 5000);
    }
  }
}
