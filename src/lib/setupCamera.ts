import * as THREE from "three";

interface CameraSetupResult {
  camera: THREE.PerspectiveCamera | null;
  center: THREE.Vector3;
}

interface CameraSetupOptions {
  containerWidth: number;
  containerHeight: number;
  group: THREE.Group;
  fov?: number;
  near?: number;
  far?: number;
  initialPosition?: THREE.Vector3;
}

export function setupCamera({
  containerWidth,
  containerHeight,
  group,
  fov = 45,
  near = 0.1,
  far = 10000,
  initialPosition = new THREE.Vector3(0, 0, 100),
}: CameraSetupOptions): CameraSetupResult {
  // Calculate bounding box and center
  const box = new THREE.Box3().setFromObject(group);
  const center = box.isEmpty()
    ? new THREE.Vector3()
    : box.getCenter(new THREE.Vector3());

  // Calculate size and camera position
  const size = box.isEmpty()
    ? new THREE.Vector3(100, 100, 100)
    : box.getSize(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const cameraZ = center.z + maxDim * 1.5;

  // Create and position camera
  const camera = new THREE.PerspectiveCamera(
    fov,
    containerWidth / containerHeight,
    near,
    far
  );
  camera.position.set(center.x, center.y, cameraZ);

  return { camera, center };
}
