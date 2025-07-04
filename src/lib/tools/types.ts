import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export type ToolType = "pan" | "select" | "measure";

export interface ToolContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  group: THREE.Group;
}

export interface Tool {
  type: ToolType;
  activate: (context: ToolContext) => void;
  deactivate: (context: ToolContext) => void;
  onMouseDown?: (event: MouseEvent, context: ToolContext) => void;
  onMouseMove?: (event: MouseEvent, context: ToolContext) => void;
  onMouseUp?: (event: MouseEvent, context: ToolContext) => void;
  onKeyDown?: (event: KeyboardEvent, context: ToolContext) => void;
  onKeyUp?: (event: KeyboardEvent, context: ToolContext) => void;
}
