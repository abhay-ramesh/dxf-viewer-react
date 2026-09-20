import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DxfDocument } from "../document/DxfDocument";

export type ToolType = "pan" | "select" | "measure";

export interface ToolContext {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  group: THREE.Group;
  /**
   * The loaded drawing. Tools resolve hits and read geometry facts from here
   * rather than interrogating the scene graph.
   */
  document: DxfDocument;
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
