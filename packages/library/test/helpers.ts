import * as THREE from "three";
import { processDxf } from "../src/processDxf";

export async function loadFixture(name: string): Promise<string> {
  return Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).text();
}

export async function loadDemoFixture(): Promise<string> {
  return Bun.file(
    new URL("../../demo/public/test.dxf", import.meta.url)
  ).text();
}

export function run(content: string, showShapeColors = true) {
  const material = new THREE.LineBasicMaterial({ color: 0x0000ff });
  return processDxf(content, material, showShapeColors, undefined);
}

/** Every object in the scene graph that would issue a draw call. */
export function renderables(group: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  group.traverse((o) => {
    if ((o as THREE.Mesh).geometry) out.push(o);
  });
  return out;
}

export function worldBox(group: THREE.Object3D): THREE.Box3 {
  group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(group);
}
