import * as THREE from "three";

interface CameraSetupResult {
  camera: THREE.OrthographicCamera | null;
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
    const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 10000);
    camera.position.set(0, 0, 10);
    return { camera, center: new THREE.Vector3() };
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  // For orthographic camera, we need to set the view frustum based on content size
  const aspect = containerWidth / containerHeight;
  const viewSize = maxDim * 0.8; // Show more content, less zoomed in

  const left = (-viewSize * aspect) / 2;
  const right = (viewSize * aspect) / 2;
  const top = viewSize / 2;
  const bottom = -viewSize / 2;

  // Distance doesn't affect the view in orthographic, but keep it reasonable
  const distance = Math.max(maxDim * 1.5, 10);

  const camera = new THREE.OrthographicCamera(
    left,
    right,
    top,
    bottom,
    0.1,
    10000
  );

  // Set default zoom to 0.8 (zoomed out, showing more content)
  camera.zoom = 0.8;
  camera.updateProjectionMatrix();

  // Position camera directly above the DXF content center looking down (for true 2D view)
  // DXF content is positioned with bottom-left at origin, so center is at box center
  // Ensure Z position is positive (above the scene) and high enough
  camera.position.set(center.x, center.y, Math.max(distance, 1));
  // Always look straight down at z=0
  camera.lookAt(center.x, center.y, 0);
  // Ensure up vector is correct for 2D view (Y is up in 2D)
  camera.up.set(0, 1, 0);

  return { camera, center };
}
