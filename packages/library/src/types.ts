import { IEntity } from "dxf-parser";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface EntityInfo {
  type: string;
  layer: string;
  color?: string;
  length?: number;
  radius?: number;
  center?: THREE.Vector3;
  startPoint?: THREE.Vector3;
  endPoint?: THREE.Vector3;
  vertices?: number;
  area?: number;
}

export interface LayerInfo {
  name: string;
  color: number;
  visible: boolean;
}

export type SnapType =
  | "endpoint"
  | "midpoint"
  | "center"
  | "intersection"
  | "quadrant"
  | "nearest";

export interface SnapPoint {
  point: THREE.Vector3;
  type: SnapType;
  distance: number;
}

export interface DxfViewerProps {
  /** The DXF file content as a string */
  dxfContent: string | null;
  /** Background color of the viewer (default: #f0f0f0) */
  backgroundColor?: string | number | THREE.Color;
  /**
   * Force every stroke to one colour.
   *
   * Leave unset to honour the drawing's own ByLayer colours, the way a CAD
   * application does. (Before 0.3 this defaulted to #0000ff, which painted
   * over whatever the file said.)
   */
  entityColor?: string | number | THREE.Color;
  /** Colour for the entity under the cursor (default: #00ff00) */
  hoverColor?: string | number | THREE.Color;
  /** Colour for selected entities (default: #ff0000) */
  selectionColor?: string | number | THREE.Color;
  /** Override specific layers by name; outranks entityColor. */
  layerColors?: Record<string, string | number | THREE.Color>;
  /** Width of the viewer (default: 100%) */
  width?: string | number;
  /** Height of the viewer (default: 100%) */
  height?: string | number;
  /** Show grid helper (default: true) */
  showGrid?: boolean;
  /** Show axes helper (default: true) */
  showAxes?: boolean;
  /** Show debug information overlay (default: false) */
  showDebugInfo?: boolean;
  /** Show debug (default: false) */
  showDebug?: boolean;
  /** Show colored shape fills with geometric holes (default: true) */
  showShapeColors?: boolean;
  /** 
   * Override colors for filled shapes. Can be:
   * - A single color (string, number, or THREE.Color) applied to all shapes
   * - An array of colors that cycles through for each shape
   * - A function that receives the shape index and returns a color
   * If not provided, shapes will use auto-generated contrasting colors
   */
  shapeColors?: 
    | string 
    | number 
    | THREE.Color 
    | Array<string | number | THREE.Color> 
    | ((index: number) => string | number | THREE.Color);
  /** Enable interactivity (pan, zoom, select, measure) (default: true) */
  interactive?: boolean;
  /** Default tool for the viewer */
  defaultTool?: "select" | "pan" | "measure";
  /** Callback when measurement is complete */
  onMeasureComplete?: (distance: number) => void;
  /** Callback when entities are loaded */
  onLoad?: (stats: Record<string, number>) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
}

export interface EntityProcessorProps {
  entity: IEntity;
  material: THREE.Material;
}

/** Summary of a parsed drawing, independent of how it is rendered. */
export interface AnalyzedData {
  totalEntities: number;
  entityTypes: Array<{ type: string; count: number | string }>;
  closedLoops: unknown;
  dxfHeader?: Record<string, unknown>;
}

export interface EntityStats {
  [key: string]: number;
}

export interface ToolContext {
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  group: THREE.Group;
  controls: OrbitControls;
}

export interface EntityTypes {
  LINE: ILineEntity;
  ARC: IArcEntity;
  CIRCLE: ICircleEntity;
  POLYLINE: IPolylineEntity;
  SPLINE: ISplineEntity;
}

export interface ILineEntity extends IEntity {
  type: "LINE";
  vertices: Array<{ x: number; y: number; z: number }>;
}

export interface IArcEntity extends IEntity {
  type: "ARC";
  center: { x: number; y: number; z: number };
  radius: number;
  startAngle: number;
  endAngle: number;
}

export interface ICircleEntity extends IEntity {
  type: "CIRCLE";
  center: { x: number; y: number; z: number };
  radius: number;
  startAngle: number;
  endAngle: number;
}

export interface IPolylineEntity extends IEntity {
  type: "POLYLINE";
  vertices: Array<{ x: number; y: number; z: number }>;
}

export interface ISplineEntity extends IEntity {
  type: "SPLINE";
  vertices: Array<{ x: number; y: number; z: number }>;
}
