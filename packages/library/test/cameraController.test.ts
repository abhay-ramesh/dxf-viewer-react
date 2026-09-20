import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import { CameraController } from "../src/core/CameraController";

const WIDTH = 800;
const HEIGHT = 600;

/** The smallest element the controller actually uses. */
function fakeElement(): HTMLElement {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    clientWidth: WIDTH,
    clientHeight: HEIGHT,
    style: {} as CSSStyleDeclaration,
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: WIDTH,
      height: HEIGHT,
      right: WIDTH,
      bottom: HEIGHT,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners.get(type)?.delete(listener);
    },
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
  } as unknown as HTMLElement;
}

function setup(zoom = 1) {
  const aspect = WIDTH / HEIGHT;
  const viewHeight = 100;
  const camera = new THREE.OrthographicCamera(
    (-viewHeight * aspect) / 2,
    (viewHeight * aspect) / 2,
    viewHeight / 2,
    -viewHeight / 2,
    0.1,
    1000
  );
  camera.position.set(0, 0, 100);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  return new CameraController(camera, fakeElement());
}

describe("CameraController — screen to world", () => {
  it("maps the viewport centre to the camera position", () => {
    const controller = setup();
    const world = controller.screenToWorld(WIDTH / 2, HEIGHT / 2);
    expect(world.x).toBeCloseTo(0, 10);
    expect(world.y).toBeCloseTo(0, 10);
  });

  it("maps corners to the frustum edges", () => {
    const controller = setup();
    const topLeft = controller.screenToWorld(0, 0);
    expect(topLeft.x).toBeCloseTo(controller.camera.left, 10);
    expect(topLeft.y).toBeCloseTo(controller.camera.top, 10);
  });

  it("accounts for zoom", () => {
    const controller = setup(2);
    const topLeft = controller.screenToWorld(0, 0);
    expect(topLeft.x).toBeCloseTo(controller.camera.left / 2, 10);
  });
});

describe("CameraController — zoom anchoring", () => {
  it("keeps the world point under the cursor fixed", () => {
    const controller = setup();
    const cursorX = 620;
    const cursorY = 170;

    const before = controller.screenToWorld(cursorX, cursorY);
    controller.zoomAt(2.5, cursorX, cursorY);
    const after = controller.screenToWorld(cursorX, cursorY);

    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(controller.camera.zoom).toBeCloseTo(2.5, 10);
  });

  it("keeps it fixed when zooming out too", () => {
    const controller = setup(4);
    const cursorX = 120;
    const cursorY = 500;

    const before = controller.screenToWorld(cursorX, cursorY);
    controller.zoomAt(0.4, cursorX, cursorY);
    const after = controller.screenToWorld(cursorX, cursorY);

    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it("holds the anchor across a long sequence of small steps", () => {
    const controller = setup();
    const cursorX = 300;
    const cursorY = 450;
    const before = controller.screenToWorld(cursorX, cursorY);

    for (let i = 0; i < 100; i++) {
      controller.zoomAt(1.02, cursorX, cursorY);
    }

    const after = controller.screenToWorld(cursorX, cursorY);
    // Drift here would show up as the drawing creeping away under the
    // pointer during a pinch.
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("clamps to the configured range", () => {
    const controller = setup();
    controller.setOptions({ minZoom: 0.5, maxZoom: 4 });

    controller.zoomAt(100, 400, 300);
    expect(controller.camera.zoom).toBe(4);

    controller.zoomAt(0.0001, 400, 300);
    expect(controller.camera.zoom).toBe(0.5);
  });

  it("emits change only when the zoom actually moved", () => {
    const controller = setup();
    controller.setOptions({ minZoom: 1, maxZoom: 1 });
    let changes = 0;
    controller.on("change", () => changes++);
    controller.zoomAt(2, 400, 300);
    expect(changes).toBe(0);
  });
});

describe("CameraController — panning", () => {
  it("moves the camera by the world equivalent of the pixels", () => {
    const controller = setup();
    // 800px spans 133.33 world units at zoom 1, so 1px is 1/6 of a unit.
    const worldPerPixel = (controller.camera.right - controller.camera.left) / WIDTH;

    // Scrolling right moves the viewport right.
    controller.panByPixels(60, 0);
    expect(controller.camera.position.x).toBeCloseTo(60 * worldPerPixel, 9);
  });

  it("inverts Y, because screens count downward and drawings count up", () => {
    const controller = setup();
    // Scrolling down moves the viewport down, which is -y in the drawing.
    controller.panByPixels(0, 30);
    expect(controller.camera.position.y).toBeLessThan(0);
  });

  it("pans less in world terms as you zoom in", () => {
    const zoomedOut = setup(1);
    const zoomedIn = setup(4);
    zoomedOut.panByPixels(100, 0);
    zoomedIn.panByPixels(100, 0);
    expect(Math.abs(zoomedIn.camera.position.x)).toBeLessThan(
      Math.abs(zoomedOut.camera.position.x)
    );
  });

  it("keeps the point under a dragged cursor fixed", () => {
    const controller = setup(1.7);
    const start = controller.screenToWorld(500, 320);
    // A drag of (+40, -25) px pans by the negated delta.
    controller.panByPixels(-40, 25);
    const afterAtNewCursor = controller.screenToWorld(540, 295);
    expect(afterAtNewCursor.x).toBeCloseTo(start.x, 9);
    expect(afterAtNewCursor.y).toBeCloseTo(start.y, 9);
  });

  it("emits change", () => {
    const controller = setup();
    let changes = 0;
    controller.on("change", () => changes++);
    controller.panByPixels(10, 10);
    expect(changes).toBe(1);
  });
});

describe("CameraController — lifecycle", () => {
  it("unsubscribes listeners", () => {
    const controller = setup();
    let changes = 0;
    const off = controller.on("change", () => changes++);
    controller.panByPixels(1, 1);
    off();
    controller.panByPixels(1, 1);
    expect(changes).toBe(1);
  });

  it("zooms about the viewport centre for button-driven zoom", () => {
    const controller = setup();
    const centre = controller.screenToWorld(WIDTH / 2, HEIGHT / 2);
    controller.zoomBy(2);
    const after = controller.screenToWorld(WIDTH / 2, HEIGHT / 2);
    expect(after.x).toBeCloseTo(centre.x, 9);
    expect(controller.camera.zoom).toBeCloseTo(2, 10);
  });

  it("drops its listeners on dispose", () => {
    const controller = setup();
    let changes = 0;
    controller.on("change", () => changes++);
    controller.dispose();
    controller.panByPixels(5, 5);
    expect(changes).toBe(0);
  });
});
