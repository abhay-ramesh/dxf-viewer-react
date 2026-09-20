export { DxfViewer } from "./DxfViewer";
// Stock UI. Each piece takes data, not the viewer, so it can be replaced.
export * from "./ui";
export { useDxfViewer } from "./useDxfViewer";
export type {
  AnalyzedData,
  DxfViewerApi,
  DxfViewerProps,
  EntityInfo,
  LayerInfo,
} from "./types";

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
export { PerformanceMonitor } from "./core/PerformanceMonitor";
export type { FrameStats } from "./core/PerformanceMonitor";
export { SelectionModel } from "./core/SelectionModel";
export { SnapService } from "./core/SnapService";
export type { SnapOptions } from "./core/SnapService";
export {
  MeasurementModel,
  formatMeasurement,
} from "./core/MeasurementModel";
export type { Measurement, MeasurementPoint } from "./core/MeasurementModel";
export { MeasurementRenderer } from "./core/MeasurementRenderer";
export { PointIndex } from "./utils/PointIndex";
export type { ViewerEventName, ViewerEvents } from "./core/events";

// Style: one cascade for strokes, fills, hover, selection and theming.
export { StyleResolver } from "./style/StyleResolver";
export { aciToRgb } from "./style/aci";
export type {
  ColorInput,
  InteractionState,
  ResolvedStyle,
  ShapeColorInput,
  StyleOptions,
  StyleSubject,
} from "./style/types";

// Loading pipeline: async, cancellable, worker-ready.
export { loadDocument, LoadAbortedError } from "./pipeline/loadDocument";
export { prepareDrawing, rehydrateLoops } from "./pipeline/prepare";
export type {
  LoadOptions,
  LoadPhase,
  LoadProgress,
  PreparedDrawing,
  PreparedLoop,
  PreparedLoops,
} from "./pipeline/types";

// Tools.
export { MeasureTool, PanTool, SelectTool } from "./tools";
export type { Tool, ToolContext, ToolType } from "./tools/types";
