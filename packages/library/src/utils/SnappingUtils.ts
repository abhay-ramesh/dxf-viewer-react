import * as THREE from "three";
import { SnapPoint } from "../types";

export class SnappingUtils {
  static getSnapPoint(
    raycaster: THREE.Raycaster,
    objects: THREE.Object3D[],
    snapDistance: number
  ): SnapPoint | null {
    const snaps: SnapPoint[] = [];

    // Helper to add candidate snap
    const checkSnap = (point: THREE.Vector3, type: SnapPoint["type"]) => {
      const distanceSq = raycaster.ray.distanceSqToPoint(point);
      const distance = Math.sqrt(distanceSq);

      if (distance < snapDistance) {
        snaps.push({ point: point.clone(), type, distance });
      }
    };

    // ... (raycaster setup)
    const originalThreshold = raycaster.params.Line.threshold;
    raycaster.params.Line.threshold = snapDistance;
    const broadIntersects = raycaster.intersectObjects(objects, true);
    raycaster.params.Line.threshold = originalThreshold;

    if (broadIntersects.length === 0) return null;

    broadIntersects.forEach((intersect) => {
      const object = intersect.object;

      // Nearest Snap (candidate)
      checkSnap(intersect.point, "nearest");

      // Specific Entity Snaps
      if (object instanceof THREE.Line) {
        const positions = object.geometry.getAttribute("position");
        if (!positions) return;

        // Check Vertices (Endpoints)
        for (let i = 0; i < positions.count; i++) {
          const vertex = new THREE.Vector3();
          vertex.fromBufferAttribute(positions, i);
          object.localToWorld(vertex);
          checkSnap(vertex, "endpoint");
        }

        // Check Midpoints
        if (object.geometry instanceof THREE.BufferGeometry) {
          // Handle LineLoop (closed loop) explicitly
          const isLoop = object instanceof THREE.LineLoop;
          const segmentCount = isLoop ? positions.count : positions.count - 1;

          for (
            let i = 0;
            i < segmentCount;
            i += object instanceof THREE.LineSegments ? 2 : 1
          ) {
            const index1 = i;
            const index2 = (i + 1) % positions.count; // Wrap around for loop

            const start = new THREE.Vector3().fromBufferAttribute(
              positions,
              index1
            );
            const end = new THREE.Vector3().fromBufferAttribute(
              positions,
              index2
            );

            object.localToWorld(start);
            object.localToWorld(end);

            const mid = new THREE.Vector3()
              .addVectors(start, end)
              .multiplyScalar(0.5);
            checkSnap(mid, "midpoint");
          }
        }
      }

      // ... (Circle/Arc/Quadrant snaps logic remains same)
      if (
        object.userData?.entityType === "CIRCLE" ||
        object.userData?.entityType === "ARC"
      ) {
        if (object.userData.center) {
          const center = new THREE.Vector3(
            object.userData.center.x,
            object.userData.center.y,
            object.userData.center.z || 0
          );
          const centerWorld = center.clone();
          object.localToWorld(centerWorld);
          checkSnap(centerWorld, "center");

          if (object.userData.radius) {
            const r = object.userData.radius;
            const quads = [
              new THREE.Vector3(center.x + r, center.y, center.z),
              new THREE.Vector3(center.x - r, center.y, center.z),
              new THREE.Vector3(center.x, center.y + r, center.z),
              new THREE.Vector3(center.x, center.y - r, center.z),
            ];

            quads.forEach((q) => {
              const qw = q.clone();
              object.localToWorld(qw);
              checkSnap(qw, "quadrant");
            });
          }
        }
      }
    });

    if (snaps.length === 0) return null;

    // Prioritize Snaps
    // Order: Endpoint/Center/Intersection/Quadrant > Midpoint > Nearest
    // Within same priority, pick closest distance.

    const priorityMap: Record<string, number> = {
      endpoint: 1,
      center: 1,
      intersection: 1,
      quadrant: 1,
      midpoint: 2,
      nearest: 3,
    };

    snaps.sort((a, b) => {
      const pA = priorityMap[a.type] || 3;
      const pB = priorityMap[b.type] || 3;
      if (pA !== pB) return pA - pB;
      return a.distance - b.distance;
    });

    return snaps[0];
  }
}
