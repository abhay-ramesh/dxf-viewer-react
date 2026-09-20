import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import { Measurement } from "../src/core/MeasurementModel";
import {
  captureViewState,
  decodeViewState,
  encodeViewState,
  VIEW_STATE_VERSION,
} from "../src/core/ViewState";

function camera(zoom = 1, x = 0, y = 0) {
  const object = new THREE.OrthographicCamera(-40, 40, 30, -30, 0.1, 1000);
  object.position.set(x, y, 100);
  object.zoom = zoom;
  object.updateProjectionMatrix();
  return object;
}

const measurement: Measurement = {
  id: "m0",
  from: { x: 0, y: 0 },
  to: { x: 3, y: 4 },
  distance: 5,
  dx: 3,
  dy: 4,
  angle: 53.13,
  createdAt: 1,
};

const base = {
  camera: camera(),
  documentOffset: new THREE.Vector3(),
  hiddenLayers: [],
  selection: [],
  measurements: [],
  tool: null,
};

describe("capturing view state", () => {
  it("records the camera centre in document coordinates", () => {
    const state = captureViewState({
      ...base,
      camera: camera(1, 150, 80),
      // The scene is shifted; the stored state should not be.
      documentOffset: new THREE.Vector3(-100, -50, 0),
    });
    expect(state.camera.x).toBeCloseTo(250, 6);
    expect(state.camera.y).toBeCloseTo(130, 6);
  });

  it("records a visible extent rather than a zoom factor", () => {
    // Frustum half-height is 30; at zoom 2 the visible half-height is 15.
    expect(captureViewState({ ...base, camera: camera(2) }).camera.extent).toBe(
      15
    );
  });

  it("records hidden layers, selection, measurements and tool", () => {
    const state = captureViewState({
      ...base,
      hiddenLayers: ["DIMS"],
      selection: ["e1", "e2"],
      measurements: [measurement],
      tool: "measure",
    });
    expect(state.hiddenLayers).toEqual(["DIMS"]);
    expect(state.selection).toEqual(["e1", "e2"]);
    expect(state.measurements.length).toBe(1);
    expect(state.tool).toBe("measure");
  });

  it("copies rather than aliases, so later edits do not mutate the capture", () => {
    const selection = ["e1"];
    const state = captureViewState({ ...base, selection });
    selection.push("e2");
    expect(state.selection).toEqual(["e1"]);
  });

  it("stamps a version", () => {
    expect(captureViewState(base).version).toBe(VIEW_STATE_VERSION);
  });
});

describe("encoding and decoding", () => {
  it("round-trips", () => {
    const state = captureViewState({
      ...base,
      camera: camera(1.5, 20, 30),
      hiddenLayers: ["A"],
      selection: ["e9"],
      measurements: [measurement],
      tool: "select",
    });
    const restored = decodeViewState(encodeViewState(state));
    expect(restored).toEqual(state);
  });

  it("rejects a state from a different version", () => {
    const state = captureViewState(base);
    const tampered = JSON.stringify({ ...state, version: 999 });
    expect(decodeViewState(tampered)).toBeNull();
  });

  it("rejects malformed input rather than throwing", () => {
    // A link truncated by a chat client, or hand-edited.
    expect(decodeViewState("not json")).toBeNull();
    expect(decodeViewState("")).toBeNull();
    expect(decodeViewState("null")).toBeNull();
    expect(decodeViewState("[]")).toBeNull();
  });

  it("rejects a camera that would leave the viewer unusable", () => {
    const bad = (camera: unknown) =>
      decodeViewState(
        JSON.stringify({ version: VIEW_STATE_VERSION, camera })
      );
    expect(bad({ x: 0, y: 0, extent: 0 })).toBeNull();
    expect(bad({ x: 0, y: 0, extent: -5 })).toBeNull();
    expect(bad({ x: Number.NaN, y: 0, extent: 1 })).toBeNull();
    expect(bad(undefined)).toBeNull();
  });

  it("drops junk from the lists instead of rejecting the whole state", () => {
    const restored = decodeViewState(
      JSON.stringify({
        version: VIEW_STATE_VERSION,
        camera: { x: 1, y: 2, extent: 10 },
        hiddenLayers: ["A", 5, null],
        selection: "not an array",
        measurements: [measurement, { id: "bad" }],
        tool: 42,
      })
    );
    expect(restored).not.toBeNull();
    expect(restored!.hiddenLayers).toEqual(["A"]);
    expect(restored!.selection).toEqual([]);
    expect(restored!.measurements.length).toBe(1);
    expect(restored!.tool).toBeNull();
  });

  it("is small enough for a URL", () => {
    const state = captureViewState({ ...base, camera: camera(1.5, 20, 30) });
    expect(encodeViewState(state).length).toBeLessThan(200);
  });
});
