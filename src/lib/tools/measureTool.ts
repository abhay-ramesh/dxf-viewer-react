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
  private measureText: THREE.Sprite | null = null;
  private lineMaterial = new THREE.LineBasicMaterial({
    color: 0xff0000,
    linewidth: 2,
    depthTest: false,
  });
  private tempLineMaterial = new THREE.LineBasicMaterial({
    color: 0xff0000,
    opacity: 0.5,
    transparent: true,
    linewidth: 1,
    depthTest: false,
  });
  private pointMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    depthTest: false,
  });
  private snapMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    opacity: 0.7,
    transparent: true,
    depthTest: false,
  });

  constructor(
    private onMeasureComplete?: (distance: number) => void,
    private onMeasureUpdate?: (
      distance: number | null,
      x: number,
      y: number
    ) => void,
    private onMeasureDisplay?: (text: string | null) => void
  ) {
    // Create snap indicator - small sphere for precise point indication
    const snapGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    this.snapIndicator = new THREE.Mesh(snapGeometry, this.snapMaterial);
    this.snapIndicator.visible = false;
    this.snapIndicator.renderOrder = 999;

    // Create point indicators - larger spheres for start/end points
    const pointGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    this.startPoint = new THREE.Mesh(pointGeometry, this.pointMaterial);
    this.endPoint = new THREE.Mesh(pointGeometry, this.pointMaterial);
    this.startPoint.visible = false;
    this.endPoint.visible = false;
    this.startPoint.renderOrder = 998;
    this.endPoint.renderOrder = 998;
  }

  activate({ controls, scene }: ToolContext) {
    controls.enablePan = false;
    controls.enableRotate = false;
    controls.mouseButtons.LEFT = -1;

    // Add visual elements to scene
    if (this.snapIndicator) scene.add(this.snapIndicator);
    if (this.startPoint) scene.add(this.startPoint);
    if (this.endPoint) scene.add(this.endPoint);

    // Reset state
    this.points = [];
    this.clearMeasurement(scene);

    // Clear any existing snap points
    this.snapPoints.forEach((point) => scene.remove(point));
    this.snapPoints = [];
  }

  deactivate({ controls, scene }: ToolContext) {
    controls.enablePan = false;
    controls.mouseButtons.LEFT = -1;

    // Clean up
    this.clearMeasurement(scene);
    this.points = [];

    if (this.snapIndicator) {
      scene.remove(this.snapIndicator);
    }
    if (this.startPoint) {
      scene.remove(this.startPoint);
    }
    if (this.endPoint) {
      scene.remove(this.endPoint);
    }

    // Clean up snap points
    this.snapPoints.forEach((point) => scene.remove(point));
    this.snapPoints = [];

    this.onMeasureUpdate?.(null, 0, 0);
    this.updateMeasurement(null);
  }

  private clearMeasurement(scene: THREE.Scene) {
    if (this.measureLine) {
      scene.remove(this.measureLine);
      this.measureLine = null;
    }
    if (this.tempLine) {
      scene.remove(this.tempLine);
      this.tempLine = null;
    }
    if (this.measureText) {
      scene.remove(this.measureText);
      this.measureText = null;
    }
    if (this.startPoint) this.startPoint.visible = false;
    if (this.endPoint) this.endPoint.visible = false;
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

        // Check vertices first
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

        // Then check line segments for perpendicular points
        for (let i = 0; i < positions.count - 1; i++) {
          const start = new THREE.Vector3();
          const end = new THREE.Vector3();
          start.fromBufferAttribute(positions, i);
          end.fromBufferAttribute(positions, i + 1);
          object.localToWorld(start);
          object.localToWorld(end);

          // Calculate line segment vector
          const line = end.clone().sub(start);
          const lineLength = line.length();

          // Calculate vector from start to point
          const pointVector = point.clone().sub(start);

          // Project point onto line
          const projection = pointVector.dot(line) / lineLength;

          // Only use projection if it falls within the line segment
          if (projection >= 0 && projection <= lineLength) {
            const normalizedLine = line.clone().divideScalar(lineLength);
            const projectedPoint = start
              .clone()
              .add(normalizedLine.multiplyScalar(projection));

            const distance = point.distanceTo(projectedPoint);
            if (distance < minDistance) {
              minDistance = distance;
              nearestPoint = projectedPoint;
            }
          }
        }
      }
    });

    return nearestPoint;
  }

  private createMeasurementText(
    distance: number,
    midPoint: THREE.Vector3
  ): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    canvas.width = 128;
    canvas.height = 32;

    // Draw text
    context.fillStyle = "rgba(0, 0, 0, 0.8)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = "bold 16px Arial";
    context.fillStyle = "white";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      `${distance.toFixed(2)} units`,
      canvas.width / 2,
      canvas.height / 2
    );

    // Create sprite
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      sizeAttenuation: false,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.copy(midPoint);
    sprite.scale.set(1, 0.25, 1);
    sprite.renderOrder = 1000;

    return sprite;
  }

  private snapPoints: THREE.Mesh[] = [];
  private snapPointMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    opacity: 0.3,
    transparent: true,
    depthTest: false,
  });

  private updateSnapPoints(
    scene: THREE.Scene,
    group: THREE.Group,
    currentPoint: THREE.Vector3
  ) {
    // Clear existing snap points
    this.snapPoints.forEach((point) => scene.remove(point));
    this.snapPoints = [];

    // Find the nearest point
    let nearestPoint = null;
    let minDistance = this.snapDistance * 2;

    group.traverse((object) => {
      if (object instanceof THREE.Line) {
        const positions = object.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          const vertex = new THREE.Vector3();
          vertex.fromBufferAttribute(positions, i);
          object.localToWorld(vertex);

          const distance = currentPoint.distanceTo(vertex);
          if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = vertex;
          }
        }
      }
    });

    // Only show the nearest point if one was found
    if (nearestPoint) {
      const snapPointGeometry = new THREE.SphereGeometry(0.2, 8, 8);
      const snapPoint = new THREE.Mesh(
        snapPointGeometry,
        this.snapPointMaterial
      );
      snapPoint.position.copy(nearestPoint);
      snapPoint.renderOrder = 997;
      scene.add(snapPoint);
      this.snapPoints.push(snapPoint);
    }
  }

  private updateMeasurement(distance: number | null) {
    if (distance === null) {
      this.onMeasureDisplay?.(null);
      return;
    }
    const text = `Distance: ${distance.toFixed(2)} units`;
    this.onMeasureDisplay?.(text);
  }

  private constrainTo90Degrees(
    start: THREE.Vector3,
    end: THREE.Vector3
  ): THREE.Vector3 {
    const delta = new THREE.Vector3().subVectors(end, start);
    const absX = Math.abs(delta.x);
    const absY = Math.abs(delta.y);

    // Determine which direction (x or y) has the larger change
    const constrainedPoint = new THREE.Vector3().copy(start);
    if (absX > absY) {
      // Constrain to horizontal
      constrainedPoint.x = end.x;
    } else {
      // Constrain to vertical
      constrainedPoint.y = end.y;
    }
    return constrainedPoint;
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
    let currentPoint = nearestPoint || intersectPoint;

    // If shift is pressed and we have a start point, constrain to 90 degrees
    if (event.shiftKey && this.points.length === 1) {
      currentPoint = this.constrainTo90Degrees(this.points[0], currentPoint);
    }

    // Update snap points visualization
    this.updateSnapPoints(scene, group, currentPoint);

    // Update snap indicator
    if (this.snapIndicator) {
      this.snapIndicator.position.copy(currentPoint);
      this.snapIndicator.visible = true;
      if (this.snapIndicator.material instanceof THREE.MeshBasicMaterial) {
        this.snapIndicator.material.opacity = nearestPoint ? 1.0 : 0.7;
      }
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
      this.updateMeasurement(distance);
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
    let point = this.findNearestPoint(intersectPoint, group) || intersectPoint;

    // If shift is pressed and we have a start point, constrain to 90 degrees
    if (event.shiftKey && this.points.length === 1) {
      point = this.constrainTo90Degrees(this.points[0], point);
    }

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
      this.onMeasureComplete?.(distance);
      this.updateMeasurement(distance);

      // Reset points for next measurement after a short delay
      setTimeout(() => {
        this.clearMeasurement(scene);
        this.points = [];
        this.updateMeasurement(null);
      }, 2000);
    }
  }
}
