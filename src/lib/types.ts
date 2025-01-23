import { IEntity } from "dxf-parser";
import { Color } from "three";

export interface DxfViewerProps {
  /** The DXF file content as a string */
  dxfContent: string;
  /** Background color of the viewer (default: #f0f0f0) */
  backgroundColor?: string | number | Color;
  /** Color of the DXF entities (default: #0000ff) */
  entityColor?: string | number | Color;
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
  /** Callback when entities are loaded */
  onLoad?: (entityStats: Record<string, number>) => void;
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
