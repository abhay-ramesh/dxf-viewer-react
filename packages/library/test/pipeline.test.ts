import { describe, expect, it } from "bun:test";
import { loadDocument, LoadAbortedError } from "../src/pipeline/loadDocument";
import { prepareDrawing } from "../src/pipeline/prepare";
import { LoadPhase, PreparedDrawing } from "../src/pipeline/types";
import { StyleResolver } from "../src/style/StyleResolver";
import { loadDemoFixture, loadFixture, renderables, run } from "./helpers";

describe("prepareDrawing", () => {
  it("returns plain, cloneable data", async () => {
    const prepared = prepareDrawing(await loadFixture("minimal.dxf"));
    // The real test of "cloneable": do it.
    expect(() => structuredClone(prepared)).not.toThrow();
    const clone = structuredClone(prepared);
    expect(clone.data.entities?.length).toBe(6);
  });

  it("references loop entities by index, not by identity", async () => {
    const prepared = prepareDrawing(await loadDemoFixture());
    expect(prepared.loops).not.toBeNull();
    const all = [...prepared.loops!.outer, ...prepared.loops!.holes];
    expect(all.length).toBe(73);
    for (const loop of all) {
      expect(Array.isArray(loop.entityIndices)).toBe(true);
      for (const index of loop.entityIndices) {
        expect(Number.isInteger(index)).toBe(true);
        expect(index).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("skips analysis when fills are off", async () => {
    const prepared = prepareDrawing(await loadDemoFixture(), {
      showShapeColors: false,
    });
    expect(prepared.loops).toBeNull();
  });

  it("reports a parse failure as data rather than throwing", () => {
    const prepared = prepareDrawing("not a dxf file");
    expect(prepared.parseError).toBeDefined();
    expect(prepared.data.entities).toEqual([]);
  });

  it("handles empty input", () => {
    const prepared = prepareDrawing("");
    expect(prepared.parseError).toBeUndefined();
    expect(prepared.data.entities).toEqual([]);
  });
});

describe("loadDocument", () => {
  const style = () => new StyleResolver();

  it("produces the same result as the synchronous path", async () => {
    const content = await loadDemoFixture();
    const sync = run(content);
    const async = await loadDocument(content, { style: style() });

    expect(async.document.size).toBe(sync.document.size);
    expect(async.stats.LINE).toBe(sync.stats.LINE);
    expect(async.stats.TOTAL_CLOSED_LOOPS).toBe(sync.stats.TOTAL_CLOSED_LOOPS);
    expect(async.stats.SHAPES_WITH_HOLES).toBe(sync.stats.SHAPES_WITH_HOLES);
    expect(renderables(async.group).length).toBe(renderables(sync.group).length);
  });

  it("survives a round trip through structuredClone, as a worker would", async () => {
    const content = await loadDemoFixture();
    const direct = await loadDocument(content, { style: style() });
    const viaClone = await loadDocument(content, {
      style: style(),
      prepare: async (text, options) =>
        structuredClone(prepareDrawing(text, options)) as PreparedDrawing,
    });

    expect(viaClone.document.size).toBe(direct.document.size);
    expect(viaClone.stats.TOTAL_CLOSED_LOOPS).toBe(
      direct.stats.TOTAL_CLOSED_LOOPS
    );
    // The index-based loop references are what make this hold: identity-based
    // ones would all dangle after the clone.
    expect(viaClone.stats.SHAPES_WITH_HOLES).toBe(direct.stats.SHAPES_WITH_HOLES);
  });

  it("reports each phase in order", async () => {
    const phases: LoadPhase[] = [];
    await loadDocument(await loadFixture("minimal.dxf"), {
      style: style(),
      onProgress: ({ phase }) => phases.push(phase),
    });
    expect(phases).toEqual(["parsing", "analysing", "building", "complete"]);
  });

  it("reports monotonically increasing progress", async () => {
    const ratios: number[] = [];
    await loadDocument(await loadFixture("minimal.dxf"), {
      style: style(),
      onProgress: ({ ratio }) => ratios.push(ratio),
    });
    expect(ratios[0]).toBe(0);
    expect(ratios[ratios.length - 1]).toBe(1);
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]).toBeGreaterThan(ratios[i - 1]);
    }
  });

  it("aborts before doing any work when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    let prepared = false;
    await expect(
      loadDocument(await loadDemoFixture(), {
        style: style(),
        signal: controller.signal,
        prepare: async (text, options) => {
          prepared = true;
          return prepareDrawing(text, options);
        },
      })
    ).rejects.toThrow(LoadAbortedError);
    expect(prepared).toBe(false);
  });

  it("aborts mid-flight", async () => {
    const controller = new AbortController();
    const pending = loadDocument(await loadDemoFixture(), {
      style: style(),
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow("Load aborted");
  });

  it("rejects with an AbortError, so callers can tell cancellation from failure", async () => {
    const controller = new AbortController();
    controller.abort();
    try {
      await loadDocument("", { style: style(), signal: controller.signal });
      throw new Error("should have rejected");
    } catch (error) {
      expect((error as Error).name).toBe("AbortError");
    }
  });

  it("yields to the event loop rather than blocking through", async () => {
    let tickedDuringLoad = false;
    const timer = setTimeout(() => {
      tickedDuringLoad = true;
    }, 0);
    await loadDocument(await loadDemoFixture(), { style: style() });
    clearTimeout(timer);
    // A fully synchronous implementation would finish before any timer ran.
    expect(tickedDuringLoad).toBe(true);
  });

  it("surfaces a parse failure as a result, not a rejection", async () => {
    const result = await loadDocument("not a dxf file", { style: style() });
    expect(result.parseError).toBeInstanceOf(Error);
    expect(result.document.size).toBe(0);
  });
});
