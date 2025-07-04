import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function setupControls(
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  group: THREE.Group,
  center: THREE.Vector3
) {
  const controls = new OrbitControls(camera, renderer.domElement);

  // Basic settings
  controls.enableDamping = false;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.enableRotate = true;

  // Control speeds
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 1.0;
  controls.rotateSpeed = 0.8;

  // Mouse buttons configuration
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE,
  };

  // Touch controls configuration
  controls.touches = {
    ONE: THREE.TOUCH.PAN, // One finger drag to pan
    TWO: THREE.TOUCH.DOLLY_ROTATE, // Two finger drag to rotate/zoom
  };

  // Keyboard modifier for rotation (Shift key)
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Shift") {
      controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
      controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    }
  };
  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === "Shift") {
      controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
      controls.touches.TWO = THREE.TOUCH.PAN;
    }
  };
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  // Enhanced dispose function to clean up event listeners
  const originalDispose = controls.dispose;
  controls.dispose = () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    originalDispose.call(controls);
  };

  // Pan settings
  controls.screenSpacePanning = true;
  controls.target.copy(center);

  return controls;
}
