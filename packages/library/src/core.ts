/**
 * Everything that does not need React.
 *
 * The viewer's core has never imported React — but the package had a single
 * entry point that pulled the React components in with it, and React was a
 * required peer dependency. A Vue or Svelte or plain-HTML integrator was told
 * to install React to draw a line.
 *
 * Import from `dxf-viewer-react/core` to get the viewer without any of that.
 */

// Viewer core: owns the WebGL context, camera, tools and render loop.
export { DxfViewerCore } from "./core/DxfViewerCore";
export type { CoreOptions } from "./core/DxfViewerCore";
export { CameraController } from "./core/CameraController";
export type { CameraControllerOptions } from "./core/CameraController";
export { RenderScheduler } from "./core/RenderScheduler";
export { PerformanceMonitor } from "./core/PerformanceMonitor";
export type { FrameStats } from "./core/PerformanceMonitor";
export type { ViewerEventName, ViewerEvents } from "./core/events";

// Input.
export { classifyWheel, DeviceHeuristic, pixelDelta } from "./core/gestures";
export type { WheelBehavior, WheelIntent, WheelLike } from "./core/gestures";

// Document model.
export { DxfDocument } from "./document/DxfDocument";
export { DrawingReport } from "./document/DrawingReport";
export type { Omission, OmissionReason } from "./document/DrawingReport";
export type {
  DerivedGeometry,
  EntityId,
  IndexedEntity,
} from "./document/types";

// Interaction models.
export { SelectionModel } from "./core/SelectionModel";
export { SnapService } from "./core/SnapService";
export type { SnapOptions } from "./core/SnapService";
export { HitTester, distanceToSegments, pointInTriangles } from "./core/HitTester";
export type { Hit } from "./core/HitTester";
export {
  MeasurementModel,
  formatMeasurement,
} from "./core/MeasurementModel";
export type { Measurement, MeasurementPoint } from "./core/MeasurementModel";
export { MeasurementRenderer } from "./core/MeasurementRenderer";

// Rendering.
export { buildBatches, paintEntity } from "./render/BatchBuilder";
export type { Batch, BatchRange, BatchResult } from "./render/BatchBuilder";

// Loading pipeline.
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
export { processDxf } from "./processDxf";
export type { ProcessDxfResult, ProcessOptions } from "./processDxf";

// Style.
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

// Text: a single-stroke font, so text batches and snaps like any geometry.
export { glyphFor, measure, advanceFor, FONT_METRICS } from "./text/strokeFont";
export type { Glyph } from "./text/strokeFont";
export { decodeText, decodeMText, decodeEntityText } from "./text/decode";
export type { DecodedText } from "./text/decode";
export { layoutText, alignFromAttachment } from "./text/layout";
export type { TextLayout, TextLayoutOptions } from "./text/layout";

// Tools.
export { MeasureTool, PanTool, SelectTool } from "./tools";
export type { Tool, ToolContext, ToolType } from "./tools/types";

// Spatial utilities.
export { PointIndex } from "./utils/PointIndex";
export { BoxIndex } from "./utils/BoxIndex";
export type { Box } from "./utils/BoxIndex";

// Shared value types.
export type {
  EntityInfo,
  LayerInfo,
  SnapPoint,
  SnapType,
  AnalyzedData,
} from "./types";
