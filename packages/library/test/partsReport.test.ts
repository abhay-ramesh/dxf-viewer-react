import { describe, expect, it } from "bun:test";
import {
  buildPartsReport,
  partsReportToCsv,
} from "../src/analysis/PartsReport";
import { loadDemoFixture, loadFixture, run } from "./helpers";

async function reportFor(fixture = "minimal.dxf", units?: string) {
  const { document, stats } = run(await loadFixture(fixture));
  return buildPartsReport(document, {
    units: units ?? String(stats.DXF_UNITS),
  });
}

describe("parts report", () => {
  it("finds one part per closed outline", async () => {
    const { document, stats } = run(await loadDemoFixture());
    const report = buildPartsReport(document);
    expect(report.totals.parts).toBe(Number(stats.SHAPES_WITH_HOLES));
  });

  it("counts holes exactly, using what the shape builder already worked out", async () => {
    const { document, stats } = run(await loadDemoFixture());
    const report = buildPartsReport(document);
    // Not inferred from bounding boxes: this matches the file's own count.
    expect(report.totals.holes).toBe(Number(stats.TOTAL_HOLES));
  });

  it("subtracts hole area from the part's area", async () => {
    const { document } = run(await loadDemoFixture());
    const report = buildPartsReport(document);
    const withHoles = report.parts.find((part) => part.holes > 0)!;
    expect(withHoles.netArea).toBeCloseTo(
      withHoles.area - withHoles.holeArea,
      6
    );
    expect(withHoles.netArea).toBeLessThan(withHoles.area);
  });

  it("counts hole perimeters into the cut length, because the tool cuts them", async () => {
    const { document } = run(await loadDemoFixture());
    const report = buildPartsReport(document);
    const withHoles = report.parts.find((part) => part.holes > 0)!;
    expect(withHoles.cutLength).toBeGreaterThan(withHoles.perimeter);
  });

  it("gives each part its bounding size, for nesting", async () => {
    const { document } = run(await loadDemoFixture());
    const report = buildPartsReport(document);
    for (const part of report.parts) {
      expect(part.width).toBeGreaterThan(0);
      expect(part.height).toBeGreaterThan(0);
    }
  });

  it("orders parts largest first", async () => {
    const { document } = run(await loadDemoFixture());
    const report = buildPartsReport(document);
    for (let i = 1; i < report.parts.length; i++) {
      expect(report.parts[i - 1].netArea).toBeGreaterThanOrEqual(
        report.parts[i].netArea
      );
    }
  });

  it("totals match the sum of the parts", async () => {
    const { document } = run(await loadDemoFixture());
    const report = buildPartsReport(document);
    const summed = report.parts.reduce(
      (sum, part) => sum + part.cutLength,
      0
    );
    expect(report.totals.cutLength).toBeCloseTo(summed, 6);
  });

  it("subtotals by layer, because layers usually mean material", async () => {
    const { document } = run(await loadDemoFixture());
    const report = buildPartsReport(document);
    const layerParts = report.byLayer.reduce((sum, l) => sum + l.parts, 0);
    expect(layerParts).toBe(report.totals.parts);
  });

  it("carries units through when the file declares them", async () => {
    const report = await reportFor("minimal.dxf");
    expect(report.units).toBe("Millimeters");
  });

  it("treats Unitless as no units", async () => {
    const report = await reportFor("minimal.dxf", "Unitless");
    expect(report.units).toBeUndefined();
  });

  it("collects the drawing's text as notes, in reading order", async () => {
    const { document } = run(await loadFixture("text.dxf"));
    const report = buildPartsReport(document);
    // Top of the drawing first.
    expect(report.notes[0]).toBe("ROTATED");
    expect(report.notes).toContain("PLATE A");
  });

  it("counts block placements, not expanded entities", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const report = buildPartsReport(document);
    const marker = report.blocks.find((b) => b.name === "MARKER");
    expect(marker?.count).toBe(1);
  });

  it("copes with a drawing that has no closed parts", async () => {
    const { document } = run(await loadFixture("unsupported.dxf"));
    const report = buildPartsReport(document);
    expect(report.totals.parts).toBe(0);
    expect(report.totals.cutLength).toBe(0);
    expect(report.byLayer).toEqual([]);
  });
});

describe("parts report as CSV", () => {
  it("writes a header, a row per part and a total", async () => {
    const { document } = run(await loadDemoFixture());
    const report = buildPartsReport(document);
    const rows = partsReportToCsv(report).split("\n");

    expect(rows[0]).toContain("cut length");
    expect(rows.length).toBe(report.parts.length + 2);
    expect(rows[rows.length - 1]).toStartWith("TOTAL");
  });

  it("puts units in the column headings", async () => {
    const { document } = run(await loadFixture("minimal.dxf"));
    const report = buildPartsReport(document, { units: "Millimeters" });
    expect(partsReportToCsv(report).split("\n")[0]).toContain("(Millimeters)");
  });

  it("escapes a layer name containing a comma", async () => {
    const { document } = run(await loadDemoFixture());
    const report = buildPartsReport(document);
    report.parts[0].layer = 'PLATE, 3MM "HR"';
    const row = partsReportToCsv(report).split("\n")[1];
    expect(row).toContain('"PLATE, 3MM ""HR"""');
  });
});
