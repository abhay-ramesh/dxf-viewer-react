import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export function setupControls(
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  group: THREE.Group,
  center: THREE.Vector3
) {
  const controls = new OrbitControls(camera, renderer.domElement);

  // Calculate size and max dimension
  const size = new THREE.Box3()
    .setFromObject(group)
    .getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  // Use maxDim as needed

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
  let isShiftDown = false;
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Shift") {
      isShiftDown = true;
      controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
      controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    }
  };
  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === "Shift") {
      isShiftDown = false;
      controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
      controls.touches.TWO = THREE.TOUCH.PAN;
    }
  };
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  // Add mouse wheel zoom
  const handleWheel = (event: WheelEvent) => {
    if (!controls.enabled) return;

    event.preventDefault();
    const delta = -event.deltaY;
    const zoomScale = 1.1;

    if (delta > 0) {
      controls.dollyIn(zoomScale);
    } else {
      controls.dollyOut(zoomScale);
    }
    controls.update();
  };
  renderer.domElement.addEventListener("wheel", handleWheel, {
    passive: false,
  });

  // Enhanced dispose function to clean up event listeners
  const originalDispose = controls.dispose;
  controls.dispose = () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    renderer.domElement.removeEventListener("wheel", handleWheel);
    originalDispose.call(controls);
  };

  // Pan settings
  controls.screenSpacePanning = true;
  controls.target.copy(center);

  return controls;
}
