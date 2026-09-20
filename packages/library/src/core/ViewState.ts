import * as THREE from "three";
import { Measurement } from "./MeasurementModel";

/** Version so a stored state from an older build can be recognised. */
export const VIEW_STATE_VERSION = 1;

export interface CameraState {
  /** Centre of the view, in **document** coordinates. */
  x: number;
  y: number;
  /** Half-height of the visible area, in document units. */
  extent: number;
}

export interface ViewState {
  version: number;
  camera: CameraState;
  /** Layers that are hidden. Absent layers are visible. */
  hiddenLayers: string[];
  selection: string[];
  measurements: Measurement[];
  tool: string | null;
}

/**
 * The whole visible state of the viewer, as plain data.
 *
 * Everything here is already a model — the camera, the layer flags, the
 * selection set, the measurement records — so capturing it is arrangement
 * rather than new machinery. What it buys is disproportionate: a link that
 * opens on the same detail someone is looking at, a session that survives a
 * reload, a print that reproduces what was on screen, and a bug report that
 * can be replayed.
 *
 * The camera is stored in document coordinates and as a visible extent
 * rather than a zoom factor, so a restored view frames the same part of the
 * drawing on a different-sized screen instead of the same number of pixels.
 */
export function captureViewState(source: {
  camera: THREE.OrthographicCamera;
  documentOffset: THREE.Vector3;
  hiddenLayers: string[];
  selection: string[];
  measurements: Measurement[];
  tool: string | null;
}): ViewState {
  const { camera, documentOffset } = source;
  const extent = (camera.top - camera.bottom) / camera.zoom / 2;

  return {
    version: VIEW_STATE_VERSION,
    camera: {
      x: camera.position.x - documentOffset.x,
      y: camera.position.y - documentOffset.y,
      extent,
    },
    hiddenLayers: [...source.hiddenLayers],
    selection: [...source.selection],
    measurements: source.measurements.map((measurement) => ({
      ...measurement,
    })),
    tool: source.tool,
  };
}

/** Compact enough for a query string. */
export function encodeViewState(state: ViewState): string {
  return JSON.stringify(state);
}

/**
 * Parse a stored state, returning null rather than throwing.
 *
 * A state that arrives in a URL is untrusted input: it may be truncated by a
 * chat client, hand-edited, or produced by a future version.
 */
export function decodeViewState(encoded: string): ViewState | null {
  try {
    const parsed = JSON.parse(encoded) as Partial<ViewState>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== VIEW_STATE_VERSION) return null;

    const camera = parsed.camera;
    if (
      !camera ||
      !Number.isFinite(camera.x) ||
      !Number.isFinite(camera.y) ||
      !Number.isFinite(camera.extent) ||
      camera.extent <= 0
    ) {
      return null;
    }

    return {
      version: VIEW_STATE_VERSION,
      camera: { x: camera.x, y: camera.y, extent: camera.extent },
      hiddenLayers: asStringArray(parsed.hiddenLayers),
      selection: asStringArray(parsed.selection),
      measurements: Array.isArray(parsed.measurements)
        ? (parsed.measurements.filter(isMeasurement) as Measurement[])
        : [],
      tool: typeof parsed.tool === "string" ? parsed.tool : null,
    };
  } catch {
    return null;
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isMeasurement(value: unknown): boolean {
  const measurement = value as Partial<Measurement>;
  return (
    !!measurement &&
    typeof measurement.id === "string" &&
    !!measurement.from &&
    !!measurement.to &&
    Number.isFinite(measurement.distance)
  );
}
