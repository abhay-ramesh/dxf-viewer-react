import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MeasurementModel } from "../core/MeasurementModel";
import { SelectionModel } from "../core/SelectionModel";
import { MeasurementRenderer } from "../core/MeasurementRenderer";
import { SnapService } from "../core/SnapService";
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
  /** What is selected and hovered. Tools mutate this rather than materials. */
  selection: SelectionModel;
  /** Significant points to snap to, zoom-aware. */
  snapping: SnapService;
  /** Recorded measurements. */
  measurements: MeasurementModel;
  /** Draws the recorded measurements and the in-progress rubber band. */
  measurementRenderer?: MeasurementRenderer;
  /** Canvas height in CSS pixels, for screen-space tolerances. */
  viewportHeight: number;
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
