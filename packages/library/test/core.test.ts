import { beforeEach, describe, expect, it } from "bun:test";
import * as THREE from "three";
import { disposeSubtree } from "../src/core/DxfViewerCore";
import { Emitter } from "../src/core/events";
import { RenderScheduler } from "../src/core/RenderScheduler";

/** Drive requestAnimationFrame by hand so frame counts are deterministic. */
class FakeClock {
  private queue: Array<() => void> = [];
  private nextHandle = 1;
  private cancelled = new Set<number>();

  install(): void {
    globalThis.requestAnimationFrame = ((callback: () => void) => {
      const handle = this.nextHandle++;
      this.queue.push(() => {
        if (!this.cancelled.has(handle)) callback();
      });
      return handle;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((handle: number) => {
      this.cancelled.add(handle);
    }) as typeof cancelAnimationFrame;
  }

  /** Run every frame currently queued (not frames they themselves queue). */
  flush(): void {
    const due = this.queue;
    this.queue = [];
    due.forEach((run) => run());
  }

  get pending(): number {
    return this.queue.length;
  }
}

describe("RenderScheduler", () => {
  let clock: FakeClock;

  beforeEach(() => {
    clock = new FakeClock();
    clock.install();
  });

  it("does not render until something invalidates", () => {
    let renders = 0;
    new RenderScheduler(() => renders++);
    clock.flush();
    expect(renders).toBe(0);
  });

  it("renders once per invalidation", () => {
    let renders = 0;
    const scheduler = new RenderScheduler(() => renders++);
    scheduler.invalidate();
    clock.flush();
    expect(renders).toBe(1);

    scheduler.invalidate();
    clock.flush();
    expect(renders).toBe(2);
  });

  it("coalesces repeated invalidations within one frame", () => {
    let renders = 0;
    const scheduler = new RenderScheduler(() => renders++);
    for (let i = 0; i < 50; i++) scheduler.invalidate();
    clock.flush();
    expect(renders).toBe(1);
  });

  it("stops scheduling frames once idle", () => {
    const scheduler = new RenderScheduler(() => {});
    scheduler.invalidate();
    clock.flush();
    expect(clock.pending).toBe(0);
    expect(scheduler.isRunning).toBe(false);
  });

  it("keeps rendering while an interaction holds the loop open", () => {
    let renders = 0;
    const scheduler = new RenderScheduler(() => renders++);
    const release = scheduler.holdContinuous();

    clock.flush();
    clock.flush();
    clock.flush();
    expect(renders).toBe(3);

    // Releasing drains the already-queued frame without drawing — nothing is
    // dirty — and queues no more. The caller asks for the settling frame.
    release();
    clock.flush();
    expect(clock.pending).toBe(0);
    expect(renders).toBe(3);

    clock.flush();
    expect(renders).toBe(3);

    scheduler.invalidate();
    clock.flush();
    expect(renders).toBe(4);
  });

  it("only stops when every holder has released", () => {
    let renders = 0;
    const scheduler = new RenderScheduler(() => renders++);
    const releaseA = scheduler.holdContinuous();
    const releaseB = scheduler.holdContinuous();

    clock.flush();
    releaseA();
    clock.flush();
    const afterA = renders;
    expect(afterA).toBeGreaterThan(1);

    // Still held by B, so frames keep coming.
    clock.flush();
    expect(renders).toBe(afterA + 1);

    releaseB();
    clock.flush();
    clock.flush();
    expect(renders).toBe(afterA + 1);
  });

  it("ignores a double release", () => {
    const scheduler = new RenderScheduler(() => {});
    const release = scheduler.holdContinuous();
    release();
    release();
    clock.flush();
    clock.flush();
    expect(clock.pending).toBe(0);
  });

  it("renders nothing after dispose", () => {
    let renders = 0;
    const scheduler = new RenderScheduler(() => renders++);
    scheduler.invalidate();
    scheduler.dispose();
    clock.flush();
    expect(renders).toBe(0);

    scheduler.invalidate();
    clock.flush();
    expect(renders).toBe(0);
  });
});

describe("Emitter", () => {
  it("delivers payloads to subscribers", () => {
    const emitter = new Emitter();
    const seen: string[] = [];
    emitter.on("tool:change", ({ tool }) => seen.push(tool));
    emitter.emit("tool:change", { tool: "select" });
    emitter.emit("tool:change", { tool: "measure" });
    expect(seen).toEqual(["select", "measure"]);
  });

  it("unsubscribes via the returned function", () => {
    const emitter = new Emitter();
    let count = 0;
    const off = emitter.on("camera:change", () => count++);
    emitter.emit("camera:change", {});
    off();
    emitter.emit("camera:change", {});
    expect(count).toBe(1);
  });

  it("tolerates a listener unsubscribing during dispatch", () => {
    const emitter = new Emitter();
    const seen: string[] = [];
    const off = emitter.on("tool:change", () => {
      seen.push("first");
      off();
    });
    emitter.on("tool:change", () => seen.push("second"));

    expect(() => emitter.emit("tool:change", { tool: "pan" })).not.toThrow();
    expect(seen).toEqual(["first", "second"]);
  });

  it("does nothing for events with no listeners", () => {
    const emitter = new Emitter();
    expect(() => emitter.emit("layers:change", {})).not.toThrow();
  });
});

describe("disposeSubtree", () => {
  it("disposes geometry and materials throughout the tree", () => {
    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial();
    root.add(new THREE.Line(geometry, material));

    let geometryDisposed = false;
    let materialDisposed = false;
    geometry.addEventListener("dispose", () => (geometryDisposed = true));
    material.addEventListener("dispose", () => (materialDisposed = true));

    disposeSubtree(root);
    expect(geometryDisposed).toBe(true);
    expect(materialDisposed).toBe(true);
  });

  it("handles multi-material meshes", () => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), [
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
    ]);
    const disposed: boolean[] = [];
    (mesh.material as THREE.Material[]).forEach((m) =>
      m.addEventListener("dispose", () => disposed.push(true))
    );
    disposeSubtree(mesh);
    expect(disposed.length).toBe(2);
  });
});
