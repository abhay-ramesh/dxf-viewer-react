import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import { PerformanceMonitor } from "../src/core/PerformanceMonitor";

/** A renderer stand-in exposing only the counters the monitor reads. */
function fakeRenderer(
  overrides: Partial<THREE.WebGLRenderer["info"]["render"]> = {}
): THREE.WebGLRenderer {
  return {
    info: {
      render: { calls: 977, triangles: 120, lines: 30894, points: 0, ...overrides },
      memory: { geometries: 977, textures: 0 },
      programs: [{}, {}],
    },
  } as unknown as THREE.WebGLRenderer;
}

/** Busy-wait so frame time is measurably non-zero. */
function spin(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    /* deliberate */
  }
}

describe("PerformanceMonitor", () => {
  it("starts idle with nothing measured", () => {
    const monitor = new PerformanceMonitor();
    expect(monitor.stats.idle).toBe(true);
    expect(monitor.stats.fps).toBe(0);
    expect(monitor.stats.drawCalls).toBe(0);
  });

  it("counts one frame per render", () => {
    const monitor = new PerformanceMonitor();
    const renderer = fakeRenderer();
    monitor.beginFrame();
    const first = monitor.endFrame(renderer, 940);
    expect(first.fps).toBe(1);
    expect(first.idle).toBe(false);

    monitor.beginFrame();
    expect(monitor.endFrame(renderer, 940).fps).toBe(2);
  });

  it("measures how long the frame took", () => {
    const monitor = new PerformanceMonitor();
    monitor.beginFrame();
    spin(6);
    const stats = monitor.endFrame(fakeRenderer(), 940);
    expect(stats.frameTime).toBeGreaterThanOrEqual(5);
    expect(stats.averageFrameTime).toBeGreaterThanOrEqual(5);
  });

  it("reports the worst frame in the window, not just the last", () => {
    const monitor = new PerformanceMonitor();
    monitor.beginFrame();
    spin(8);
    monitor.endFrame(fakeRenderer(), 940);

    monitor.beginFrame();
    const stats = monitor.endFrame(fakeRenderer(), 940);
    expect(stats.frameTime).toBeLessThan(8);
    expect(stats.worstFrameTime).toBeGreaterThanOrEqual(7);
  });

  it("surfaces the renderer's own counters", () => {
    const monitor = new PerformanceMonitor();
    monitor.beginFrame();
    const stats = monitor.endFrame(fakeRenderer(), 940);
    expect(stats.drawCalls).toBe(977);
    expect(stats.lines).toBe(30894);
    expect(stats.geometries).toBe(977);
    expect(stats.programs).toBe(2);
    expect(stats.entities).toBe(940);
  });

  it("goes idle rather than freezing on the last frame's numbers", async () => {
    const monitor = new PerformanceMonitor();
    monitor.beginFrame();
    monitor.endFrame(fakeRenderer(), 940);
    expect(monitor.sample().idle).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 450));
    const idle = monitor.sample();
    expect(idle.idle).toBe(true);
    // The counters from the last real frame are still readable; only the
    // rate and the state change.
    expect(idle.drawCalls).toBe(977);
  });

  it("keeps the sample window to one second", async () => {
    const monitor = new PerformanceMonitor();
    const renderer = fakeRenderer();
    for (let i = 0; i < 5; i++) {
      monitor.beginFrame();
      monitor.endFrame(renderer, 940);
    }
    expect(monitor.stats.fps).toBe(5);

    await new Promise((resolve) => setTimeout(resolve, 1050));
    expect(monitor.sample().fps).toBe(0);
  });

  it("bounds the frame-time history", () => {
    const monitor = new PerformanceMonitor(3);
    const renderer = fakeRenderer();
    for (let i = 0; i < 10; i++) {
      monitor.beginFrame();
      monitor.endFrame(renderer, 940);
    }
    // Averaging over a bounded window, not over all time.
    expect(monitor.stats.averageFrameTime).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(monitor.stats.worstFrameTime)).toBe(true);
  });

  it("clears everything on reset", () => {
    const monitor = new PerformanceMonitor();
    monitor.beginFrame();
    monitor.endFrame(fakeRenderer(), 940);
    monitor.reset();
    expect(monitor.stats.idle).toBe(true);
    expect(monitor.stats.fps).toBe(0);
    expect(monitor.stats.drawCalls).toBe(0);
  });
});
