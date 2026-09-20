import * as THREE from "three";
import {
  classifyWheel,
  DeviceHeuristic,
  WheelBehavior,
} from "./gestures";

export interface CameraControllerOptions {
  /** How wheel events are interpreted. "auto" decides per device. */
  wheelBehavior?: WheelBehavior;
  /** Multiplier on zoom travel. 1 is calibrated to feel like Figma. */
  zoomSpeed?: number;
  minZoom?: number;
  maxZoom?: number;
  /** Which mouse buttons drag-pan. Defaults to all three. */
  panButtons?: number[];
}

type Listener = () => void;

const DEFAULTS: Required<CameraControllerOptions> = {
  wheelBehavior: "auto",
  zoomSpeed: 1,
  minZoom: 1e-4,
  maxZoom: 1e6,
  panButtons: [0, 1, 2],
};

/**
 * Pan and zoom for a 2D orthographic view.
 *
 * This replaces OrbitControls, which is a camera for orbiting a 3D scene. We
 * used about a fifth of it and fought the rest: rotation disabled, polar
 * angle pinned, every mouse button remapped to pan, and — the reason this
 * exists — a wheel handler that treats every event as zoom, with no way to
 * say that two fingers on a trackpad mean pan.
 *
 * Zoom is exponential in wheel travel and anchored at the cursor: the world
 * point under the pointer stays under the pointer, which is what makes
 * zooming feel like the drawing is being scaled rather than the camera being
 * flown.
 */
export class CameraController {
  private options: Required<CameraControllerOptions>;
  private readonly device = new DeviceHeuristic();
  private readonly listeners = new Map<string, Set<Listener>>();

  private dragging = false;
  private dragButton = -1;
  private lastX = 0;
  private lastY = 0;
  private spaceHeld = false;

  /** Set false to ignore all input, e.g. for a non-interactive viewer. */
  enabled = true;
  /** Set false while a tool wants the drag for itself. */
  dragPanEnabled = true;
  zoomEnabled = true;

  constructor(
    readonly camera: THREE.OrthographicCamera,
    private readonly element: HTMLElement,
    options: CameraControllerOptions = {}
  ) {
    this.options = { ...DEFAULTS, ...options };
    this.attach();
  }

  setOptions(options: CameraControllerOptions): void {
    this.options = { ...this.options, ...options };
  }

  // ------------------------------------------------------------- listeners

  on(event: "change" | "start" | "end", listener: Listener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  private emit(event: "change" | "start" | "end"): void {
    this.listeners.get(event)?.forEach((listener) => listener());
  }

  // ------------------------------------------------------------------ math

  private get viewport(): { width: number; height: number } {
    return {
      width: this.element.clientWidth || 1,
      height: this.element.clientHeight || 1,
    };
  }

  /** World units per screen pixel, at the current zoom. */
  private get worldPerPixel(): { x: number; y: number } {
    const { width, height } = this.viewport;
    const { camera } = this;
    return {
      x: (camera.right - camera.left) / camera.zoom / width,
      y: (camera.top - camera.bottom) / camera.zoom / height,
    };
  }

  /** Where a client-space point lands in the world. */
  screenToWorld(clientX: number, clientY: number): THREE.Vector3 {
    const rect = this.element.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const { camera } = this;
    return new THREE.Vector3(
      camera.position.x + (ndcX * (camera.right - camera.left)) / 2 / camera.zoom,
      camera.position.y + (ndcY * (camera.top - camera.bottom)) / 2 / camera.zoom,
      0
    );
  }

  /**
   * Move the *view* by a screen-space delta, in pixels.
   *
   * Signs follow scrolling, not dragging: a positive dy means "scroll down",
   * so the viewport moves down and, because the world counts upward, the
   * camera's y decreases. Drag-to-pan negates the cursor delta before calling
   * this, which is what makes the drawing follow the cursor.
   */
  panByPixels(dx: number, dy: number): void {
    const scale = this.worldPerPixel;
    this.camera.position.x += dx * scale.x;
    this.camera.position.y -= dy * scale.y;
    this.camera.updateMatrixWorld();
    this.emit("change");
  }

  /**
   * Scale the view about a screen point.
   *
   * The anchor is held by solving for the camera position that puts the same
   * world point back under the same pixel afterwards.
   */
  zoomAt(factor: number, clientX: number, clientY: number): void {
    const before = this.screenToWorld(clientX, clientY);
    const next = clampZoom(
      this.camera.zoom * factor,
      this.options.minZoom,
      this.options.maxZoom
    );
    if (next === this.camera.zoom) return;

    this.camera.zoom = next;
    this.camera.updateProjectionMatrix();

    const after = this.screenToWorld(clientX, clientY);
    this.camera.position.x += before.x - after.x;
    this.camera.position.y += before.y - after.y;
    this.camera.updateMatrixWorld();
    this.emit("change");
  }

  /** Scale about the centre of the viewport. For buttons and keys. */
  zoomBy(factor: number): void {
    const rect = this.element.getBoundingClientRect();
    this.zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  // -------------------------------------------------------------- handlers

  private onWheel = (event: WheelEvent): void => {
    if (!this.enabled) return;
    // Always: otherwise the page scrolls or the browser zooms behind us.
    event.preventDefault();

    this.device.observe(event);
    const intent = classifyWheel(event, {
      behavior: this.options.wheelBehavior,
      device: this.device,
      zoomSpeed: this.options.zoomSpeed,
    });

    this.emit("start");
    if (intent.kind === "zoom") {
      if (this.zoomEnabled) this.zoomAt(intent.amount, intent.x, intent.y);
    } else {
      this.panByPixels(intent.dx, intent.dy);
    }
    this.emit("end");
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled) return;
    const allowed =
      this.options.panButtons.includes(event.button) &&
      (this.dragPanEnabled || this.spaceHeld);
    if (!allowed) return;

    this.dragging = true;
    this.dragButton = event.button;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.element.setPointerCapture?.(event.pointerId);
    this.element.style.cursor = "grabbing";
    this.emit("start");
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging || !this.enabled) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.panByPixels(-dx, -dy);
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.dragging || event.button !== this.dragButton) return;
    this.dragging = false;
    this.dragButton = -1;
    this.element.releasePointerCapture?.(event.pointerId);
    this.element.style.cursor = "";
    this.emit("end");
  };

  /** Space-drag pans regardless of the active tool, as design tools do. */
  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "Space" || this.spaceHeld) return;
    this.spaceHeld = true;
    this.element.style.cursor = "grab";
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.code !== "Space") return;
    this.spaceHeld = false;
    if (!this.dragging) this.element.style.cursor = "";
  };

  // ------------------------------------------------------- touch (2 finger)

  private touches = new Map<number, { x: number; y: number }>();

  private onTouchStart = (event: PointerEvent): void => {
    if (event.pointerType !== "touch") return;
    this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  private onTouchMove = (event: PointerEvent): void => {
    if (event.pointerType !== "touch" || !this.enabled) return;
    const previous = this.touches.get(event.pointerId);
    if (!previous) return;

    if (this.touches.size === 1) {
      this.panByPixels(
        -(event.clientX - previous.x),
        -(event.clientY - previous.y)
      );
    } else if (this.touches.size === 2) {
      const others = [...this.touches.entries()].filter(
        ([id]) => id !== event.pointerId
      );
      const other = others[0]?.[1];
      if (other) {
        const before = Math.hypot(previous.x - other.x, previous.y - other.y);
        const after = Math.hypot(
          event.clientX - other.x,
          event.clientY - other.y
        );
        if (before > 0 && this.zoomEnabled) {
          this.zoomAt(
            after / before,
            (event.clientX + other.x) / 2,
            (event.clientY + other.y) / 2
          );
        }
      }
    }
    this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  private onTouchEnd = (event: PointerEvent): void => {
    this.touches.delete(event.pointerId);
  };

  // ------------------------------------------------------------- lifecycle

  private attach(): void {
    this.element.addEventListener("wheel", this.onWheel, { passive: false });
    this.element.addEventListener("pointerdown", this.onPointerDown);
    this.element.addEventListener("pointermove", this.onPointerMove);
    this.element.addEventListener("pointerup", this.onPointerUp);
    this.element.addEventListener("pointercancel", this.onPointerUp);
    this.element.addEventListener("pointerdown", this.onTouchStart);
    this.element.addEventListener("pointermove", this.onTouchMove);
    this.element.addEventListener("pointerup", this.onTouchEnd);
    this.element.addEventListener("pointercancel", this.onTouchEnd);
    this.element.addEventListener("keydown", this.onKeyDown);
    this.element.addEventListener("keyup", this.onKeyUp);
    // The browser's own pinch-zoom would fight ours.
    this.element.style.touchAction = "none";
  }

  dispose(): void {
    this.element.removeEventListener("wheel", this.onWheel);
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("pointercancel", this.onPointerUp);
    this.element.removeEventListener("pointerdown", this.onTouchStart);
    this.element.removeEventListener("pointermove", this.onTouchMove);
    this.element.removeEventListener("pointerup", this.onTouchEnd);
    this.element.removeEventListener("pointercancel", this.onTouchEnd);
    this.element.removeEventListener("keydown", this.onKeyDown);
    this.element.removeEventListener("keyup", this.onKeyUp);
    this.listeners.clear();
    this.touches.clear();
  }
}

function clampZoom(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
