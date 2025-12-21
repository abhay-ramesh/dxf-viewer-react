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
  /** Color of the DXF entities (default: #0000ff) */
  entityColor?: string | number | THREE.Color;
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
