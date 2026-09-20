import { describe, expect, it } from "bun:test";
import { DrawingReport } from "../src/document/DrawingReport";
import { loadDemoFixture, loadFixture, run } from "./helpers";

describe("DrawingReport", () => {
  it("starts complete", () => {
    const report = new DrawingReport();
    expect(report.isComplete).toBe(true);
    expect(report.summarise()).toBeNull();
    expect(report.omittedCount).toBe(0);
  });

  it("counts repeats of the same omission", () => {
    const report = new DrawingReport();
    report.record("HATCH", "unsupported-type");
    report.record("HATCH", "unsupported-type");
    report.record("HATCH", "unsupported-type");
    expect(report.all).toEqual([
      { type: "HATCH", reason: "unsupported-type", count: 3, detail: undefined },
    ]);
  });

  it("keeps the same type separate per reason", () => {
    const report = new DrawingReport();
    report.record("SPLINE", "empty-geometry");
    report.record("SPLINE", "failed", "bad knots");
    expect(report.all.length).toBe(2);
    expect(report.omittedTypes).toEqual(["SPLINE"]);
  });

  it("keeps the first detail it is given", () => {
    const report = new DrawingReport();
    report.record("SPLINE", "failed", "first");
    report.record("SPLINE", "failed", "second");
    expect(report.all[0].detail).toBe("first");
  });

  it("orders by frequency, so the biggest gap reads first", () => {
    const report = new DrawingReport();
    report.record("LEADER", "unsupported-type");
    for (let i = 0; i < 5; i++) report.record("HATCH", "unsupported-type");
    expect(report.all[0].type).toBe("HATCH");
  });

  it("writes a line a consumer can show as-is", () => {
    const report = new DrawingReport();
    report.record("DIMENSION", "unsupported-type");
    report.record("DIMENSION", "unsupported-type");
    report.record("HATCH", "unsupported-type");
    expect(report.summarise()).toBe(
      "Could not display 2 DIMENSION (not supported yet), 1 HATCH (not supported yet)"
    );
  });

  it("distinguishes every reason in words", () => {
    const report = new DrawingReport();
    report.record("A", "unsupported-type");
    report.record("B", "empty-geometry");
    report.record("C", "failed");
    report.record("D", "missing-block");
    report.record("E", "not-parsed");
    const summary = report.summarise()!;
    expect(summary).toContain("not supported yet");
    expect(summary).toContain("no drawable geometry");
    expect(summary).toContain("failed to build");
    expect(summary).toContain("referenced a block the file does not contain");
    expect(summary).toContain("not read by the parser");
  });

  it("serialises", () => {
    const report = new DrawingReport();
    report.recordDrawn();
    report.record("HATCH", "unsupported-type");
    expect(JSON.parse(JSON.stringify(report))).toEqual({
      drawn: 1,
      omitted: [{ type: "HATCH", reason: "unsupported-type", count: 1 }],
    });
  });
});

describe("DrawingReport — from processDxf", () => {
  it("reports nothing omitted for a drawing it fully supports", async () => {
    const { report } = run(await loadDemoFixture());
    expect(report.isComplete).toBe(true);
    expect(report.drawnCount).toBe(940);
  });

  it("counts what it drew", async () => {
    const { report } = run(await loadFixture("minimal.dxf"));
    // 5 drawable entities plus the block's line.
    expect(report.drawnCount).toBe(6);
  });

  it("flags entity types the parser silently dropped", async () => {
    const dxf = await loadFixture("unsupported.dxf");
    const { report, document } = run(dxf);

    expect(report.isComplete).toBe(false);
    // dxf-parser discards HATCH and LEADER before the viewer sees them, so
    // only the file's own text can reveal that they were there.
    expect(report.omittedTypes).toContain("HATCH");
    expect(report.omittedTypes).toContain("LEADER");
    expect(report.all.find((o) => o.type === "HATCH")!.reason).toBe(
      "not-parsed"
    );
    // The supported entities still render.
    expect(document.size).toBeGreaterThan(0);
  });

  it("flags an INSERT pointing at a block the file does not contain", async () => {
    const dxf = await loadFixture("unsupported.dxf");
    const { report } = run(dxf);
    const missing = report.all.find((o) => o.reason === "missing-block");
    expect(missing).toBeDefined();
    expect(missing!.detail).toBe("NOT_THERE");
  });

  it("is empty when the file could not be parsed at all", () => {
    const { report } = run("not a dxf file");
    expect(report.drawnCount).toBe(0);
    expect(report.isComplete).toBe(true);
  });
});

describe("census", () => {
  it("counts entity markers in the ENTITIES section", async () => {
    const { censusFromText } = await import("../src/document/census");
    const declared = censusFromText(await loadFixture("unsupported.dxf"));
    expect(declared).toEqual({ LINE: 1, HATCH: 1, LEADER: 1, INSERT: 1 });
  });

  it("ignores structural markers that are not entities", async () => {
    const { censusFromText } = await import("../src/document/census");
    const declared = censusFromText(await loadFixture("minimal.dxf"));
    expect(declared.SECTION).toBeUndefined();
    expect(declared.ENDSEC).toBeUndefined();
    expect(declared.TABLE).toBeUndefined();
    expect(declared.LINE).toBe(2);
  });

  it("does not count entities that live inside blocks", async () => {
    const { censusFromText } = await import("../src/document/census");
    // minimal.dxf's MARKER block holds a LINE; only the two model-space
    // LINEs should be counted, or an un-placed block would be reported as
    // missing from the drawing.
    const declared = censusFromText(await loadFixture("minimal.dxf"));
    expect(declared.LINE).toBe(2);
  });

  it("reports the shortfall per type, not just presence", async () => {
    const { parserShortfall } = await import("../src/document/census");
    expect(
      parserShortfall({ SPLINE: 10, LINE: 5 }, { SPLINE: 1, LINE: 5 })
    ).toEqual({ SPLINE: 9 });
  });

  it("returns nothing for a file with no ENTITIES section", async () => {
    const { censusFromText } = await import("../src/document/census");
    expect(censusFromText("0\nEOF\n")).toEqual({});
  });
});
