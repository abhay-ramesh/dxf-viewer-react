import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function setupControls(
  camera: THREE.OrthographicCamera,
  renderer: THREE.WebGLRenderer,
  center: THREE.Vector3
) {
  const controls = new OrbitControls(camera, renderer.domElement);

  // Basic settings for 2D orthographic view
  controls.enableDamping = false;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.enableRotate = false; // No rotation for 2D view

  // Control speeds
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 1.0;

  // Mouse buttons configuration - 2D focused
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY, // Middle mouse for zoom
    RIGHT: THREE.MOUSE.PAN,
  };

  // Touch controls configuration for 2D
  controls.touches = {
    ONE: THREE.TOUCH.PAN, // One finger drag to pan
    TWO: THREE.TOUCH.DOLLY_PAN, // Two finger drag to zoom and pan
  };

  // Pan settings
  controls.screenSpacePanning = true;
  controls.target.copy(center);

  return controls;
}
