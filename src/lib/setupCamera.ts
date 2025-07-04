import * as THREE from "three";

interface CameraSetupResult {
  camera: THREE.PerspectiveCamera | null;
  center: THREE.Vector3;
}

interface CameraSetupOptions {
  containerWidth: number;
  containerHeight: number;
  group: THREE.Group;
}

export function setupCamera({
  containerWidth,
  containerHeight,
  group,
}: CameraSetupOptions): CameraSetupResult {
  // Calculate the bounding box and center of the group
  const box = new THREE.Box3().setFromObject(group);

  // Handle empty bounding box case
  if (box.isEmpty()) {
    console.log("Camera setup: Empty bounding box, using default position");
    const camera = new THREE.PerspectiveCamera(
      45,
      containerWidth / containerHeight,
      0.1,
      10000
    );
    camera.position.set(0, 0, 10);
    return { camera, center: new THREE.Vector3() };
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  // Use the same distance calculation as the working main branch
  // Add a minimum distance to prevent camera from being too close
  const distance = Math.max(maxDim * 1.5, 10);

  console.log("Camera setup:", {
    center: { x: center.x, y: center.y, z: center.z },
    size: { x: size.x, y: size.y, z: size.z },
    maxDim,
    distance,
    cameraPosition: { x: center.x, y: center.y, z: center.z + distance },
  });

  const camera = new THREE.PerspectiveCamera(
    45, // Match main branch FOV
    containerWidth / containerHeight,
    0.1,
    10000 // Match main branch far plane
  );

  // Position camera directly above the content looking down (for 2D view)
  // This gives a true 2D perspective perpendicular to the XY plane
  camera.position.set(center.x, center.y, center.z + distance);
  camera.lookAt(center);

  return { camera, center };
}
