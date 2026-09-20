import DxfParser from "dxf-parser";
const text = await Bun.file(new URL("../../demo/public/test.dxf", import.meta.url)).text();
const d = new DxfParser().parseSync(text) as any;
const sample = d.entities.slice(0, 3).map((e: any) => ({ type: e.type, layer: e.layer, color: e.color, colorIndex: e.colorIndex }));
console.log("entities:", JSON.stringify(sample, null, 1));
const layers = Object.values(d.tables?.layer?.layers ?? {}).slice(0, 5) as any[];
console.log("layers:", JSON.stringify(layers.map(l => ({ name: l.name, color: l.color, colorIndex: l.colorIndex })), null, 1));
const withColor = d.entities.filter((e: any) => e.color !== undefined).length;
console.log("entities with explicit color:", withColor, "of", d.entities.length);
