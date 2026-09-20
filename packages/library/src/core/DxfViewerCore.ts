import * as THREE from "three";

import { DxfDocument } from "../document/DxfDocument";
import { EntityId } from "../document/types";
import { ProcessDxfResult } from "../processDxf";
import { CameraController } from "./CameraController";
import { StyleResolver } from "../style/StyleResolver";
import { HitTester } from "./HitTester";
import { MeasurementModel } from "./MeasurementModel";
import { MeasurementRenderer } from "./MeasurementRenderer";
import { SelectionModel } from "./SelectionModel";
import { SnapService } from "./SnapService";
import { captureViewState, ViewState } from "./ViewState";
import { Tool, ToolContext, ToolType } from "../tools/types";
import { WheelBehavior } from "./gestures";
import { Emitter, ViewerEventName, ViewerEvents } from "./events";
import { FrameStats, PerformanceMonitor } from "./PerformanceMonitor";
import { RenderScheduler } from "./RenderScheduler";

export interface CoreOptions {
  /** Decides colours. Supply the same resolver used to build the document. */
  style?: StyleResolver;
  /**
   * How wheel events are read. "auto" pans for a trackpad and zooms for a
   * mouse; ctrl/cmd always zooms.
   */
  wheelBehavior?: WheelBehavior;
  /** Multiplier on zoom travel. */
  zoomSpeed?: number;
  backgroundColor?: string | number | THREE.Color;
  showGrid?: boolean;
  showAxes?: boolean;
  gridSize?: number;
  axesSize?: number;
  interactive?: boolean;
}

interface LayerState {
  visible: boolean;
}

const DEFAULTS = {
  backgroundColor: 0xf0f0f0 as string | number | THREE.Color,
  wheelBehavior: "auto" as WheelBehavior,
  zoomSpeed: 1,
  showGrid: true,
  showAxes: true,
  gridSize: 100,
  axesSize: 50,
  interactive: true,
};

/**
 * The viewer, as an object that owns its WebGL context.
 *
 * The renderer, scene, camera and controls are created once, when the core is
 * constructed, and live until `dispose()`. Changing what is displayed —
 * document, background, grid, layer visibility, tool — mutates them in place.
 *
 * That is the whole point. Previously each of these was a `useMemo` over
 * props, so toggling the grid rebuilt the scene and resizing the window
 * rebuilt the camera, throwing away the user's pan and zoom. Nothing here
 * imports React; the hook is a binding over this.
 */
export class DxfViewerCore {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: CameraController;

  private readonly emitter = new Emitter();
  private readonly scheduler: RenderScheduler;
  private readonly monitor = new PerformanceMonitor();
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private readonly resizeObserver: ResizeObserver | null = null;

  /** Everything that is not drawing content: grid, axes. */
  private readonly helpers = new THREE.Group();
  private gridHelper: THREE.Group | null = null;
  private axesHelper: THREE.AxesHelper | null = null;

  /** The current drawing's renderables. Swapped wholesale by setDocument. */
  private contentGroup = new THREE.Group();
  private document = new DxfDocument();
  private layerGroups: Record<string, THREE.Group> = {};
  private layerState = new Map<string, LayerState>();

  /** What is selected and hovered, as data rather than as swapped materials. */
  readonly selection: SelectionModel;
  /** Significant points to snap to. Shared by every precision feature. */
  readonly snapping = new SnapService();
  /** What is under a point. Backed by a grid over entity bounding boxes. */
  readonly hitTesting = new HitTester();
  /** Recorded measurements, in drawing coordinates and with units. */
  readonly measurements: MeasurementModel;
  private readonly measurementRenderer = new MeasurementRenderer();
  private style: StyleResolver;

  private readonly tools = new Map<string, Tool>();
  private activeTool: Tool | null = null;
  private releaseContinuous: (() => void) | null = null;

  private options: Required<Omit<CoreOptions, "style">>;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    options: CoreOptions = {}
  ) {
    this.options = { ...DEFAULTS, ...stripUndefined(options) };
    this.style = options.style ?? new StyleResolver();
    this.measurements = new MeasurementModel(() => {
      this.measurementRenderer.sync(this.measurements, this.document);
      this.emitter.emit("measure:change", {
        measurements: [...this.measurements.all],
      });
      this.invalidate();
    });
    this.selection = new SelectionModel(this.document, this.style, () => {
      this.emitter.emit("selection:change", {
        ids: this.selection.ids,
        primary: null,
      });
      this.invalidate();
    });

    const { clientWidth, clientHeight } = container;
    const width = clientWidth || 800;
    const height = clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      precision: "mediump",
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(this.options.backgroundColor);
    this.helpers.name = "dxf-helpers";
    this.scene.add(this.helpers);
    this.contentGroup.name = "dxf-content-group";
    this.scene.add(this.contentGroup);
    this.scene.add(this.measurementRenderer.group);
    this.applyHelperOptions();

    const viewSize = 40;
    const aspect = width / height;
    this.camera = new THREE.OrthographicCamera(
      (-viewSize * aspect) / 2,
      (viewSize * aspect) / 2,
      viewSize / 2,
      -viewSize / 2,
      0.1,
      10000
    );
    this.camera.position.set(0, 0, 100);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);

    this.controls = new CameraController(this.camera, this.renderer.domElement, {
      wheelBehavior: this.options.wheelBehavior,
      zoomSpeed: this.options.zoomSpeed,
    });
    this.controls.enabled = this.options.interactive;

    // Render, and nothing else. The controller mutates the camera directly
    // in response to input and emits "change", so there is no per-frame
    // update step to run here — and running one would re-enter this loop.
    this.scheduler = new RenderScheduler(() => {
      this.monitor.beginFrame();
      this.renderer.render(this.scene, this.camera);
      if (this.statsTimer !== null) {
        this.emitter.emit(
          "stats:frame",
          this.monitor.endFrame(this.renderer, this.document.size)
        );
      }
    });

    // A control interaction needs frames while it runs, and exactly one more
    // when it ends.
    this.controls.on("start", () => {
      this.releaseContinuous?.();
      this.releaseContinuous = this.scheduler.holdContinuous();
    });
    this.controls.on("end", () => {
      this.releaseContinuous?.();
      this.releaseContinuous = null;
      this.invalidate();
    });
    this.controls.on("change", () => {
      this.emitter.emit("camera:change", {});
      this.invalidate();
    });

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }

    this.attachPointerListeners();
    this.invalidate();
  }

  // ---------------------------------------------------------------- content

  /**
   * Show a parsed drawing.
   *
   * @param preserveView keep the current pan and zoom instead of framing the
   * new content. Callers re-processing the same file after a styling change
   * want this; callers loading a different file do not.
   */
  setDocument(result: ProcessDxfResult, preserveView = false): void {
    if (this.disposed) return;

    this.scene.remove(this.contentGroup);
    disposeSubtree(this.contentGroup);

    this.contentGroup = result.group;
    this.contentGroup.name = "dxf-content-group";
    this.document = result.document;
    this.layerGroups = result.layers;
    this.selection.retarget(this.document, this.style);
    this.snapping.setDocument(this.document);
    this.hitTesting.setDocument(this.document);
    this.measurements.setUnits(
      typeof result.stats.DXF_UNITS === "string"
        ? result.stats.DXF_UNITS
        : undefined
    );
    this.scene.add(this.contentGroup);

    // Re-apply layer visibility the user had already chosen, and register any
    // layer we have not seen before as visible.
    for (const name of Object.keys(this.layerGroups)) {
      const existing = this.layerState.get(name);
      if (existing) this.layerGroups[name].visible = existing.visible;
      else this.layerState.set(name, { visible: true });
    }

    if (!preserveView) this.fitToContent();

    if (result.parseError) {
      this.emitter.emit("document:error", { error: result.parseError });
    } else {
      this.emitter.emit("document:loaded", {
        entityCount: this.document.size,
        stats: numericOnly(result.stats),
        report: result.report,
      });
    }
    this.invalidate();
  }

  getDocument(): DxfDocument {
    return this.document;
  }

  /** Swap the resolver, e.g. when a colour prop changed. */
  setStyle(style: StyleResolver): void {
    this.style = style;
    this.selection.retarget(this.document, style);
    this.invalidate();
  }

  // ------------------------------------------------------------ appearance

  setOptions(options: CoreOptions): void {
    if (this.disposed) return;
    const { style: nextStyle, ...visual } = options;
    if (nextStyle) this.setStyle(nextStyle);
    const next = { ...this.options, ...stripUndefined(visual) };
    type VisualKey = keyof Omit<CoreOptions, "style">;
    const changed = (key: VisualKey) => next[key] !== this.options[key];

    const helpersChanged =
      changed("showGrid") ||
      changed("showAxes") ||
      changed("gridSize") ||
      changed("axesSize");
    const backgroundChanged = changed("backgroundColor");
    const interactiveChanged = changed("interactive");

    this.options = next;

    if (backgroundChanged) {
      (this.scene.background as THREE.Color).set(
        new THREE.Color(this.options.backgroundColor)
      );
    }
    if (helpersChanged) this.applyHelperOptions();
    this.controls.setOptions({
      wheelBehavior: this.options.wheelBehavior,
      zoomSpeed: this.options.zoomSpeed,
    });
    if (interactiveChanged) {
      this.controls.enabled = this.options.interactive;
      if (!this.options.interactive) this.setTool(null);
    }
    if (backgroundChanged || helpersChanged) this.invalidate();
  }

  private applyHelperOptions(): void {
    if (this.gridHelper) {
      this.helpers.remove(this.gridHelper);
      disposeSubtree(this.gridHelper);
      this.gridHelper = null;
    }
    if (this.axesHelper) {
      this.helpers.remove(this.axesHelper);
      this.axesHelper.geometry.dispose();
      this.axesHelper = null;
    }

    if (this.options.showGrid) {
      this.gridHelper = createCADGrid(this.options.gridSize);
      this.gridHelper.position.z = -0.01;
      this.helpers.add(this.gridHelper);
    }
    if (this.options.showAxes) {
      this.axesHelper = new THREE.AxesHelper(this.options.axesSize);
      this.axesHelper.position.z = -0.005;
      this.helpers.add(this.axesHelper);
    }
  }

  // ---------------------------------------------------------------- layers

  setLayerVisibility(layer: string, visible: boolean): void {
    const group = this.layerGroups[layer];
    if (!group) return;
    this.layerState.set(layer, { visible });
    group.visible = visible;
    this.emitter.emit("layers:change", {});
    this.invalidate();
  }

  toggleLayer(layer: string): void {
    this.setLayerVisibility(layer, !this.isLayerVisible(layer));
  }

  isLayerVisible(layer: string): boolean {
    return this.layerState.get(layer)?.visible ?? true;
  }

  // ----------------------------------------------------------------- tools

  registerTool(tool: Tool): void {
    this.tools.set(tool.type, tool);
  }

  getTool(type: string): Tool | undefined {
    return this.tools.get(type);
  }

  get registeredTools(): string[] {
    return [...this.tools.keys()];
  }

  setTool(type: ToolType | string | null): void {
    if (this.disposed) return;
    const next = type === null ? null : this.tools.get(type) ?? null;
    if (next === this.activeTool) return;

    const context = this.toolContext();
    this.activeTool?.deactivate(context);
    this.activeTool = next;
    if (next && this.options.interactive) {
      next.activate(context);
      this.emitter.emit("tool:change", { tool: next.type });
    }
    this.invalidate();
  }

  get currentTool(): string | null {
    return this.activeTool?.type ?? null;
  }

  private toolContext(): ToolContext {
    return {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      controls: this.controls,
      group: this.contentGroup,
      document: this.document,
      selection: this.selection,
      snapping: this.snapping,
      hitTesting: this.hitTesting,
      measurements: this.measurements,
      measurementRenderer: this.measurementRenderer,
      viewportHeight: this.viewportSize().height,
    };
  }

  private attachPointerListeners(): void {
    const canvas = this.renderer.domElement;
    const forward =
      (handler: "onMouseDown" | "onMouseMove" | "onMouseUp") =>
      (event: MouseEvent) => {
        if (!this.activeTool || !this.options.interactive) return;
        this.activeTool[handler]?.(event, this.toolContext());
        this.invalidate();
      };
    canvas.addEventListener("mousedown", forward("onMouseDown"));
    canvas.addEventListener("mousemove", forward("onMouseMove"));
    canvas.addEventListener("mouseup", forward("onMouseUp"));

    // Tools that accept keys (Escape to abandon, Backspace to undo) need the
    // canvas focusable, or the events never arrive.
    canvas.tabIndex = 0;
    canvas.style.outline = "none";
    const forwardKey =
      (handler: "onKeyDown" | "onKeyUp") => (event: KeyboardEvent) => {
        if (!this.activeTool || !this.options.interactive) return;
        this.activeTool[handler]?.(event, this.toolContext());
        this.invalidate();
      };
    canvas.addEventListener("keydown", forwardKey("onKeyDown"));
    canvas.addEventListener("keyup", forwardKey("onKeyUp"));
    canvas.addEventListener("mousedown", () => canvas.focus());
  }

  // ---------------------------------------------------------------- camera

  /** Frame the whole drawing. */
  fitToContent(padding = 1.1): void {
    const box = new THREE.Box3().setFromObject(this.contentGroup);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const { width, height } = this.viewportSize();
    const aspect = width / height;

    const viewHeight = Math.max(size.y, size.x / aspect) * padding;
    const viewWidth = viewHeight * aspect;

    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.zoom = 1;
    this.camera.position.set(center.x, center.y, 100);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.invalidate();
  }

  private viewportSize(): { width: number; height: number } {
    return {
      width: this.container.clientWidth || 800,
      height: this.container.clientHeight || 600,
    };
  }

  /**
   * Re-fit the frustum to a new aspect ratio without rebuilding the camera,
   * so pan and zoom survive a resize.
   */
  resize(): void {
    if (this.disposed) return;
    const { width, height } = this.viewportSize();
    const aspect = width / height;

    const currentHeight = this.camera.top - this.camera.bottom;
    const centerX = (this.camera.left + this.camera.right) / 2;
    const newWidth = currentHeight * aspect;

    this.camera.left = centerX - newWidth / 2;
    this.camera.right = centerX + newWidth / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.invalidate();
  }

  // ---------------------------------------------------------------- output

  /**
   * Render to a data URL.
   *
   * `scale` renders off-screen at a multiple of the display size, so export
   * resolution is no longer tied to the size of the canvas on screen.
   */
  exportImage(format: "png" | "jpeg" = "png", scale = 1): string | null {
    if (this.disposed) return null;
    if (scale === 1) {
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL(`image/${format}`);
    }

    const { width, height } = this.viewportSize();
    const target = new THREE.WebGLRenderTarget(width * scale, height * scale);
    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);

    const buffer = new Uint8Array(width * scale * height * scale * 4);
    this.renderer.readRenderTargetPixels(
      target,
      0,
      0,
      width * scale,
      height * scale,
      buffer
    );
    this.renderer.setRenderTarget(previous);

    const canvas = window.document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      target.dispose();
      return null;
    }
    const image = ctx.createImageData(canvas.width, canvas.height);
    // WebGL reads bottom-up; canvas ImageData is top-down.
    const rowBytes = canvas.width * 4;
    for (let y = 0; y < canvas.height; y++) {
      const source = (canvas.height - y - 1) * rowBytes;
      image.data.set(buffer.subarray(source, source + rowBytes), y * rowBytes);
    }
    ctx.putImageData(image, 0, 0);
    target.dispose();
    return canvas.toDataURL(`image/${format}`);
  }

  // ---------------------------------------------------------------- events

  on<K extends ViewerEventName>(
    event: K,
    listener: (payload: ViewerEvents[K]) => void
  ): () => void {
    return this.emitter.on(event, listener);
  }

  emit<K extends ViewerEventName>(event: K, payload: ViewerEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  // ------------------------------------------------------------ view state

  /**
   * Everything the reader can see, as plain data.
   *
   * Stored in document coordinates and as a visible extent, so restoring it
   * on a different-sized screen frames the same part of the drawing.
   */
  captureView(): ViewState {
    return captureViewState({
      camera: this.camera,
      documentOffset: this.document.worldOffset,
      hiddenLayers: Object.keys(this.layerGroups).filter(
        (layer) => !this.isLayerVisible(layer)
      ),
      selection: this.selection.ids,
      measurements: [...this.measurements.all],
      tool: this.currentTool,
    });
  }

  /** Put the viewer back the way a captured state describes. */
  restoreView(state: ViewState): void {
    if (this.disposed) return;

    const { width, height } = this.viewportSize();
    const aspect = width / height;
    const extent = state.camera.extent;

    this.camera.top = extent;
    this.camera.bottom = -extent;
    this.camera.left = -extent * aspect;
    this.camera.right = extent * aspect;
    this.camera.zoom = 1;
    this.camera.position.set(
      state.camera.x + this.document.worldOffset.x,
      state.camera.y + this.document.worldOffset.y,
      100
    );
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    for (const layer of Object.keys(this.layerGroups)) {
      this.setLayerVisibility(layer, !state.hiddenLayers.includes(layer));
    }

    this.selection.set(state.selection);
    this.measurements.load(state.measurements);
    if (state.tool) this.setTool(state.tool);

    this.emitter.emit("camera:change", {});
    this.invalidate();
  }

  // ------------------------------------------------------------ monitoring

  /**
   * Start reporting frame statistics on `stats:frame`.
   *
   * Off by default: reading `renderer.info` every frame and pushing an event
   * into React is a cost the common case should not pay. The timer exists so
   * the readout can fall back to "idle" instead of freezing on the last
   * frame's numbers, which on an on-demand renderer is most of the time.
   */
  startMonitoring(intervalMs = 250): () => void {
    this.stopMonitoring();
    this.statsTimer = setInterval(() => {
      this.emitter.emit("stats:frame", this.monitor.sample());
    }, intervalMs);
    this.invalidate();
    return () => this.stopMonitoring();
  }

  stopMonitoring(): void {
    if (this.statsTimer !== null) clearInterval(this.statsTimer);
    this.statsTimer = null;
    this.monitor.reset();
  }

  get frameStats(): FrameStats {
    return this.monitor.stats;
  }

  /** Ask for a frame. Safe to call from anywhere, including tools. */
  invalidate(): void {
    this.scheduler.invalidate();
  }

  // --------------------------------------------------------------- teardown

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.releaseContinuous?.();
    this.stopMonitoring();
    this.scheduler.dispose();
    this.resizeObserver?.disconnect();
    this.activeTool?.deactivate(this.toolContext());
    this.activeTool = null;
    this.controls.dispose();
    this.measurementRenderer.dispose();
    this.emitter.clear();

    disposeSubtree(this.scene);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}

// --------------------------------------------------------------- utilities

function stripUndefined<T extends object>(value: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, v] of Object.entries(value)) {
    if (v !== undefined) out[key as keyof T] = v as T[keyof T];
  }
  return out;
}

function numericOnly(
  stats: Record<string, number | string>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === "number") out[key] = value;
  }
  return out;
}

/** Release GPU memory for everything under an object, including the object. */
export function disposeSubtree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as Partial<THREE.Mesh>;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}

/** CAD-style grid: a fine minor grid under a bolder major one. */
export function createCADGrid(size: number): THREE.Group {
  const group = new THREE.Group();
  group.userData.isGrid = true;

  const minor = new THREE.GridHelper(size, 200, 0x555555, 0x444444);
  minor.rotation.x = Math.PI / 2;
  minor.position.z = -0.002;
  const minorMaterial = minor.material as THREE.LineBasicMaterial;
  minorMaterial.transparent = true;
  minorMaterial.opacity = 0.15;

  const major = new THREE.GridHelper(size, 20, 0x999999, 0x777777);
  major.rotation.x = Math.PI / 2;
  major.position.z = -0.001;
  const majorMaterial = major.material as THREE.LineBasicMaterial;
  majorMaterial.transparent = true;
  majorMaterial.opacity = 0.4;

  group.add(minor, major);
  return group;
}
