import * as THREE from "three";
import { HitTester } from "../src/core/HitTester";
import { processDxf } from "../src/processDxf";
import { StyleResolver } from "../src/style/StyleResolver";

const content = await Bun.file(
  new URL("../../demo/public/test.dxf", import.meta.url)
).text();

function measure(batching: boolean) {
  const t0 = performance.now();
  const { group, document } = processDxf(content, {
    style: new StyleResolver(),
    batching,
  });
  const build = performance.now() - t0;

  let objects = 0;
  let vertices = 0;
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    const mesh = object as Partial<THREE.Mesh>;
    if (!mesh.geometry) return;
    objects++;
    vertices += mesh.geometry.getAttribute("position")?.count ?? 0;
    if (mesh.material) materials.add(mesh.material as THREE.Material);
  });

  return { document, group, build, objects, vertices, materials: materials.size };
}

const unbatched = measure(false);
const batched = measure(true);

// Picking: the old path raycast every object; the new one reads the index.
const camera = new THREE.OrthographicCamera(-400, 400, 300, -300, 0.1, 1000);
camera.position.set(400, 250, 100);
camera.updateProjectionMatrix();
camera.updateMatrixWorld();
unbatched.group.updateMatrixWorld(true);

const raycaster = new THREE.Raycaster();
const picks = 500;
const rayStart = performance.now();
for (let i = 0; i < picks; i++) {
  raycaster.setFromCamera(
    new THREE.Vector2((i / picks) * 2 - 1, ((i * 7) % picks) / picks * 2 - 1),
    camera
  );
  raycaster.intersectObjects(unbatched.group.children, true);
}
const rayMs = performance.now() - rayStart;

const tester = new HitTester();
tester.setDocument(batched.document);
const bounds = batched.document.bounds();
const indexStart = performance.now();
for (let i = 0; i < picks; i++) {
  const t = i / picks;
  tester.pick(
    batched.document.toWorldSpace(
      new THREE.Vector3(
        bounds.min.x + t * (bounds.max.x - bounds.min.x),
        bounds.min.y + (((i * 7) % picks) / picks) * (bounds.max.y - bounds.min.y),
        0
      )
    ),
    2
  );
}
const indexMs = performance.now() - indexStart;

const row = (label: string, before: string, after: string) =>
  console.log(`${label.padEnd(22)} ${before.padStart(12)} ${after.padStart(12)}`);

console.log(`\n${"".padEnd(22)} ${"per entity".padStart(12)} ${"batched".padStart(12)}`);
console.log("-".repeat(48));
row("draw calls", String(unbatched.objects), String(batched.objects));
row("materials", String(unbatched.materials), String(batched.materials));
row("vertices", String(unbatched.vertices), String(batched.vertices));
row("build", `${unbatched.build.toFixed(0)} ms`, `${batched.build.toFixed(0)} ms`);
row(
  `pick x${picks}`,
  `${rayMs.toFixed(1)} ms`,
  `${indexMs.toFixed(1)} ms`
);
row(
  "per pick",
  `${((rayMs / picks) * 1000).toFixed(0)} us`,
  `${((indexMs / picks) * 1000).toFixed(0)} us`
);
console.log(`\nentities: ${batched.document.size}`);
