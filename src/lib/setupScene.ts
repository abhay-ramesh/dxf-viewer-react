import * as THREE from "three";

interface SceneSetupOptions {
  backgroundColor: number | string | THREE.Color;
  showGrid: boolean;
  showAxes: boolean;
  group: THREE.Group;
  gridSize?: number;
  gridDivisions?: number;
  axesSize?: number;
}

export function setupScene({
  backgroundColor,
  showGrid,
  showAxes,
  group,
  gridSize = 1000,
  gridDivisions = 100,
  axesSize = 500,
}: SceneSetupOptions): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(backgroundColor);

  if (showGrid) {
    // Create a grid helper instead of plane geometry
    const grid = new THREE.GridHelper(
      gridSize,
      gridDivisions,
      0x888888, // Main grid lines
      0x444444 // Secondary grid lines
    );
    // Rotate grid to XY plane (default is XZ)
    grid.rotation.x = Math.PI / 2;
    // Position grid slightly below DXF content so DXF appears on top
    grid.position.z = -0.01;
    scene.add(grid);
  }

  if (showAxes) {
    const axesHelper = new THREE.AxesHelper(axesSize);
    // Position axes slightly above grid but below DXF content
    axesHelper.position.z = -0.005;
    scene.add(axesHelper);
  }

  scene.add(group);
  return scene;
}
