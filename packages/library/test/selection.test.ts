import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import { SelectionModel } from "../src/core/SelectionModel";
import { StyleResolver } from "../src/style/StyleResolver";
import { loadDemoFixture, loadFixture, run } from "./helpers";

async function model(fixture = "minimal.dxf") {
  const style = new StyleResolver();
  const { document } = run(await loadFixture(fixture), true);
  let changes = 0;
  const selection = new SelectionModel(document, style, () => changes++);
  return { selection, document, style, changed: () => changes };
}

describe("SelectionModel — selection as data", () => {
  it("starts empty", async () => {
    const { selection } = await model();
    expect(selection.ids).toEqual([]);
    expect(selection.size).toBe(0);
  });

  it("holds more than one entity at a time", async () => {
    const { selection, document } = await model();
    const ids = [...document.all()].slice(0, 3).map((e) => e.id);
    selection.set(ids);
    expect(selection.size).toBe(3);
    expect(ids.every((id) => selection.has(id))).toBe(true);
  });

  it("extends and shrinks", async () => {
    const { selection, document } = await model();
    const [a, b, c] = [...document.all()].map((e) => e.id);
    selection.set([a]);
    selection.add(b, c);
    expect(selection.size).toBe(3);
    selection.remove(b);
    expect(selection.size).toBe(2);
    expect(selection.has(b)).toBe(false);
  });

  it("toggles", async () => {
    const { selection, document } = await model();
    const [a] = [...document.all()].map((e) => e.id);
    selection.toggle(a);
    expect(selection.has(a)).toBe(true);
    selection.toggle(a);
    expect(selection.has(a)).toBe(false);
  });

  it("selects a whole layer", async () => {
    const { selection, document } = await model();
    selection.selectLayer("WALLS");
    expect(selection.size).toBe(document.idsOnLayer("WALLS").length);
    expect(selection.size).toBeGreaterThan(1);
  });

  it("adds a layer to an existing selection when additive", async () => {
    const { selection, document } = await model();
    selection.selectLayer("WALLS");
    const walls = selection.size;
    selection.selectLayer("0", true);
    expect(selection.size).toBe(walls + document.idsOnLayer("0").length);
  });

  it("ignores ids the document does not know", async () => {
    const { selection } = await model();
    selection.set(["nonexistent", "alsomissing"]);
    expect(selection.size).toBe(0);
  });

  it("notifies once per actual change", async () => {
    const { selection, document, changed } = await model();
    const [a, b] = [...document.all()].map((e) => e.id);
    selection.set([a]);
    expect(changed()).toBe(1);
    selection.set([a]); // No change.
    expect(changed()).toBe(1);
    selection.set([b]);
    expect(changed()).toBe(2);
    selection.clear();
    expect(changed()).toBe(3);
  });

  it("drops stale state when the document is replaced", async () => {
    const { selection, document, style } = await model();
    selection.set([[...document.all()][0].id]);
    expect(selection.size).toBe(1);

    const replacement = run(await loadDemoFixture()).document;
    selection.retarget(replacement, style);
    expect(selection.size).toBe(0);
    expect(selection.hoveredId).toBeNull();
  });
});

describe("SelectionModel — derived appearance", () => {
  it("reports the state of each entity", async () => {
    const { selection, document } = await model();
    const [a, b] = [...document.all()].map((e) => e.id);
    selection.set([a]);
    selection.setHovered(b);
    expect(selection.stateOf(a)).toBe("selected");
    expect(selection.stateOf(b)).toBe("hover");
    expect(selection.stateOf("missing")).toBe("normal");
  });

  it("prefers selected over hover for the same entity", async () => {
    const { selection, document } = await model();
    const [a] = [...document.all()].map((e) => e.id);
    selection.set([a]);
    selection.setHovered(a);
    expect(selection.stateOf(a)).toBe("selected");
  });

  it("restyles the object on select and restores it on clear", async () => {
    const { selection, document } = await model();
    const entity = [...document.all()][0];
    const object = entity.object as THREE.Line;
    const base = object.material;

    selection.set([entity.id]);
    expect(object.material).not.toBe(base);

    selection.clear();
    expect(object.material).toBe(base);
  });

  it("restores the base material after hover as well", async () => {
    const { selection, document } = await model();
    const entity = [...document.all()][0];
    const object = entity.object as THREE.Line;
    const base = object.material;

    selection.setHovered(entity.id);
    expect(object.material).not.toBe(base);
    selection.setHovered(null);
    expect(object.material).toBe(base);
  });

  it("uses the configured selection colour", async () => {
    const style = new StyleResolver({ selectionColor: 0x00ffff });
    const { document } = run(await loadFixture("minimal.dxf"));
    const selection = new SelectionModel(document, style, () => {});
    const entity = [...document.all()][0];

    selection.set([entity.id]);
    const material = (entity.object as THREE.Line)
      .material as THREE.LineBasicMaterial;
    expect(material.color.getHex()).toBe(0x00ffff);
  });

  it("does not leak materials across repeated selections", async () => {
    const { selection, document, style } = await model();
    const ids = [...document.all()].map((e) => e.id);
    for (let i = 0; i < 20; i++) {
      selection.set([ids[i % ids.length]]);
    }
    // Materials are shared by appearance, so churning the selection creates
    // at most one extra per distinct look, not one per call.
    expect(style.materialCount).toBeLessThan(10);
  });
});
