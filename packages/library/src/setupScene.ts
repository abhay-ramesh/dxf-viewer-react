import * as THREE from "three";

interface SceneSetupOptions {
  backgroundColor: number | string | THREE.Color;
  showGrid: boolean;
  showAxes: boolean;
  group: THREE.Group;
  gridSize?: number;
  axesSize?: number;
}

// Create a professional CAD-style grid with major and minor grid lines
function createCADGrid(size: number): THREE.Group {
  const gridGroup = new THREE.Group();

  // Minor grid - fine divisions (every 5 units)
  const minorGrid = new THREE.GridHelper(
    size,
    200, // 200 divisions = 5 units per division
    0x555555, // Very subtle center lines
    0x444444 // Very subtle grid lines
  );
  minorGrid.rotation.x = Math.PI / 2;
  minorGrid.position.z = -0.002; // Slightly lower

  // Make minor grid very subtle
  const minorMaterial = minorGrid.material as THREE.LineBasicMaterial;
  minorMaterial.transparent = true;
  minorMaterial.opacity = 0.15;

  // Major grid - bold divisions (every 50 units)
  const majorGrid = new THREE.GridHelper(
    size,
    20, // 20 divisions = 50 units per division
    0x999999, // Prominent center lines (X and Y axes)
    0x777777 // Prominent grid lines
  );
  majorGrid.rotation.x = Math.PI / 2;
  majorGrid.position.z = -0.001; // Slightly higher than minor

  // Make major grid more visible
  const majorMaterial = majorGrid.material as THREE.LineBasicMaterial;
  majorMaterial.transparent = true;
  majorMaterial.opacity = 0.4;

  gridGroup.add(minorGrid);
  gridGroup.add(majorGrid);

  return gridGroup;
}

export function setupScene({
  backgroundColor,
  showGrid,
  showAxes,
  group,
  gridSize = 1000,
  axesSize = 500,
}: SceneSetupOptions): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(backgroundColor);

  if (showGrid) {
    // Create professional CAD-style grid using THREE.GridHelper
    const grid = createCADGrid(gridSize);
    grid.position.z = -0.01;
    scene.add(grid);
  }

  if (showAxes) {
    const axesHelper = new THREE.AxesHelper(axesSize);
    // Position axes slightly above grid but below DXF content
    axesHelper.position.z = -0.005;
    scene.add(axesHelper);
  }

  // Always add the group - it's required
  if (!group) {
    console.error("[DXF Viewer] setupScene: group is null/undefined");
  } else {
    // Ensure group has a name for identification
    if (!group.name) {
      group.name = 'dxf-content-group';
    }
    
    scene.add(group);
    
    // Verify it was added - if not, this is a critical error
    if (!scene.children.includes(group)) {
      console.error("[DXF Viewer] setupScene: CRITICAL - Group was not added to scene!");
      // Try again
      scene.add(group);
      if (!scene.children.includes(group)) {
        console.error("[DXF Viewer] setupScene: CRITICAL - Group still not in scene after retry!");
      }
    }
  }
  
  return scene;
}
