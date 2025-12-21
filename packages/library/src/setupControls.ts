import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function setupControls(
  camera: THREE.OrthographicCamera,
  renderer: THREE.WebGLRenderer,
  center: THREE.Vector3
) {
  // Verify OrbitControls is available
  if (typeof OrbitControls === 'undefined') {
    console.error("[DXF Viewer] OrbitControls is not available in setupControls");
    throw new Error("OrbitControls is not available. Three.js addons may not be properly bundled.");
  }
  
  let controls;
  try {
    controls = new OrbitControls(camera, renderer.domElement);
  } catch (error) {
    console.error("[DXF Viewer] Error creating OrbitControls instance:", error);
    throw error;
  }

  // Basic settings for 2D orthographic view
  controls.enableDamping = false; // No damping for instant response
  controls.dampingFactor = 0; // Ensure no damping
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.enableRotate = false; // No rotation for 2D view

  // Control speeds - increased for instant, responsive feel
  controls.zoomSpeed = 1; // Faster zoom for instant response
  controls.panSpeed = 1; // Feel equal to what the mouse is moving
  
  // Make zoom and pan feel instant without any delay
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0;

  // Mouse buttons configuration - 2D focused
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.PAN, // Middle mouse for panning
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
  
  // Ensure instant response - no smoothing or delays
  controls.minDistance = 0;
  controls.maxDistance = Infinity;
  
  // Make zoom feel more natural and instant
  // Higher zoom speed multiplier for wheel events
  controls.zoomToCursor = true; // Zoom towards cursor position for better UX

  // Lock camera to 2D view (looking straight down)
  // Polar angle: 0 = top, PI/2 = side, PI = bottom
  // Set both min and max to PI/2 to lock looking straight down
  controls.minPolarAngle = Math.PI / 2;
  controls.maxPolarAngle = Math.PI / 2;
  
  // Allow rotation around Z axis (azimuthal) but keep it flat
  controls.minAzimuthalAngle = -Infinity;
  controls.maxAzimuthalAngle = Infinity;
  
  // Ensure we're always looking straight down
  controls.target.set(center.x, center.y, 0);

  return controls;
}
