import DxfParser from "dxf-parser";
import { DxfAnalyzer } from "../src/utils/DxfAnalyzer";
import { processDxf } from "../src/processDxf";
import { StyleResolver } from "../src/style/StyleResolver";

const content = await Bun.file(new URL("../../demo/public/test.dxf", import.meta.url)).text();

const t0 = performance.now();
const data = new DxfParser().parseSync(content) as any;
const t1 = performance.now();

const loops = DxfAnalyzer.findClosedLoops({ entities: data.entities });
const t2 = performance.now();

const whole = performance.now();
processDxf(content, { style: new StyleResolver() });
const wholeEnd = performance.now();

const parse = t1 - t0;
const analyze = t2 - t1;
const total = wholeEnd - whole;
console.log(`parse (dxf-parser):      ${parse.toFixed(1)} ms`);
console.log(`closed-loop analysis:    ${analyze.toFixed(1)} ms`);
console.log(`total processDxf:        ${total.toFixed(1)} ms`);
console.log(`=> remainder (geometry): ${(total - parse - analyze).toFixed(1)} ms`);
console.log(`parse+analysis share:    ${(((parse + analyze) / total) * 100).toFixed(0)}%`);
console.log(`loops found: ${loops?.length ?? "n/a"}`);
