import * as THREE from "three";

export interface FrameStats {
  /** Frames drawn in the last second. Zero while idle, which is correct. */
  fps: number;
  /** Wall-clock cost of the last render call, in milliseconds. */
  frameTime: number;
  /** Mean frame time across the sample window. */
  averageFrameTime: number;
  /** Worst frame in the sample window — where stutter actually shows up. */
  worstFrameTime: number;
  /**
   * True when nothing has asked for a frame recently.
   *
   * With on-demand rendering this is the normal resting state, so a reader
   * needs to be told the difference between "idle" and "stalled at 0 fps".
   */
  idle: boolean;
  /** Draw calls in the last frame. The number batching is meant to collapse. */
  drawCalls: number;
  triangles: number;
  lines: number;
  points: number;
  /** Geometries and textures currently resident on the GPU. */
  geometries: number;
  textures: number;
  programs: number;
  /** Entities in the loaded document. */
  entities: number;
}

const EMPTY: FrameStats = {
  fps: 0,
  frameTime: 0,
  averageFrameTime: 0,
  worstFrameTime: 0,
  idle: true,
  drawCalls: 0,
  triangles: 0,
  lines: 0,
  points: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  entities: 0,
};

/**
 * How long without a frame before we call the viewer idle.
 *
 * Kept below the sampling interval's period so the readout settles within a
 * tick or two of the last frame rather than lagging a full second behind.
 */
const IDLE_AFTER_MS = 400;

/**
 * Frame timing for a renderer that does not render every frame.
 *
 * A conventional FPS counter assumes a continuous loop, so it reports the
 * frame rate of the loop itself. This viewer only draws when something
 * changed, which means the interesting questions are different: how long does
 * a frame cost when we do draw one, how many draw calls did it take, and is
 * the viewer resting or struggling.
 */
export class PerformanceMonitor {
  private readonly samples: number[] = [];
  private readonly timestamps: number[] = [];
  private frameStart = 0;
  private lastFrameAt = 0;
  private current: FrameStats = { ...EMPTY };

  constructor(private readonly sampleSize = 60) {}

  beginFrame(): void {
    this.frameStart = performance.now();
  }

  /** Close the frame and fold the renderer's own counters in. */
  endFrame(renderer: THREE.WebGLRenderer, entities: number): FrameStats {
    const now = performance.now();
    const frameTime = now - this.frameStart;
    this.lastFrameAt = now;

    this.samples.push(frameTime);
    if (this.samples.length > this.sampleSize) this.samples.shift();

    this.timestamps.push(now);
    this.trimWindow(now);

    const info = renderer.info;
    this.current = {
      fps: this.timestamps.length,
      frameTime,
      averageFrameTime: mean(this.samples),
      worstFrameTime: Math.max(...this.samples),
      idle: false,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      lines: info.render.lines,
      points: info.render.points,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      entities,
    };
    return this.current;
  }

  /**
   * Re-read the stats without having rendered.
   *
   * Called on a timer so the overlay can go quiet rather than freezing on the
   * last value it happened to see.
   */
  sample(): FrameStats {
    const now = performance.now();
    this.trimWindow(now);
    const idle = now - this.lastFrameAt > IDLE_AFTER_MS;
    this.current = {
      ...this.current,
      fps: this.timestamps.length,
      idle,
    };
    return this.current;
  }

  get stats(): FrameStats {
    return this.current;
  }

  reset(): void {
    this.samples.length = 0;
    this.timestamps.length = 0;
    this.current = { ...EMPTY };
    this.lastFrameAt = 0;
  }

  private trimWindow(now: number): void {
    while (this.timestamps.length && now - this.timestamps[0] > 1000) {
      this.timestamps.shift();
    }
  }
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
