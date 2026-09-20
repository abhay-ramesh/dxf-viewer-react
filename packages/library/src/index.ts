export { DxfViewer } from "./DxfViewer";
export { useDxfViewer } from "./useDxfViewer";
export type { DxfViewerProps } from "./types";

// Document model: stable entity identity, derived geometry, and lookups.
export { DxfDocument } from "./document/DxfDocument";
export type {
  DerivedGeometry,
  EntityId,
  IndexedEntity,
} from "./document/types";

// Viewer core: owns the WebGL context, usable without React.
export { DxfViewerCore } from "./core/DxfViewerCore";
export type { CoreOptions } from "./core/DxfViewerCore";
export { RenderScheduler } from "./core/RenderScheduler";
export type { ViewerEventName, ViewerEvents } from "./core/events";

// Tools.
export { MeasureTool, PanTool, SelectTool } from "./tools";
export type { Tool, ToolContext, ToolType } from "./tools/types";
