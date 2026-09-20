import { ProcessDxfResult } from "../processDxf";
import { StyleResolver } from "../style/StyleResolver";

export type LoadPhase = "parsing" | "analysing" | "building" | "complete";

export interface LoadProgress {
  phase: LoadPhase;
  /** 0 to 1. Coarse by design: phase boundaries, not per-entity counts. */
  ratio: number;
}

/**
 * The parse and analysis output, in a form that survives a structured clone.
 *
 * Loops reference their entities by **index** rather than by object identity,
 * which is what lets this cross a worker boundary: after cloning, the
 * receiving side's entity objects are different objects, so identity-based
 * references would all dangle.
 */
export interface PreparedDrawing {
  /** dxf-parser output. Plain objects throughout. */
  data: ParsedDxf;
  loops: PreparedLoops | null;
  parseError?: string;
}

export interface ParsedDxf {
  entities?: unknown[];
  blocks?: Record<string, unknown>;
  header?: Record<string, unknown>;
  tables?: { layer?: { layers?: Record<string, unknown> } };
}

export interface PreparedLoop {
  entityIndices: number[];
  vertices: Array<{ x: number; y: number }>;
  area: number;
  perimeter: number;
}

export interface PreparedLoops {
  outer: PreparedLoop[];
  holes: PreparedLoop[];
}

export interface LoadOptions {
  style: StyleResolver;
  showShapeColors?: boolean;
  /** Abort the load. A cancelled load rejects with an AbortError. */
  signal?: AbortSignal;
  onProgress?: (progress: LoadProgress) => void;
  /**
   * Replace the parse-and-analyse step.
   *
   * The default runs it on this thread, yielding between phases. Supply a
   * worker-backed implementation to move it off the main thread entirely;
   * `PreparedDrawing` is designed to be postMessage-able as-is.
   */
  prepare?: (
    content: string,
    options: { showShapeColors: boolean; signal?: AbortSignal }
  ) => Promise<PreparedDrawing>;
}

export type LoadResult = ProcessDxfResult;
