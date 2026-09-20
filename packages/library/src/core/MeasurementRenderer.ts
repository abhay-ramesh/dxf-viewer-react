import * as THREE from "three";
import { DxfDocument } from "../document/DxfDocument";
import { Measurement, MeasurementModel } from "./MeasurementModel";

const LINE_COLOR = 0xff3b30;
const TICK_SIZE_FRACTION = 0.02;

/**
 * Draws whatever the measurement model currently holds.
 *
 * The tool no longer owns the visuals, which is what let a measurement erase
 * itself after two seconds: the drawing was the state, so it had to be
 * cleaned up. Now the records are the state and this rebuilds from them, so
 * measurements persist, stack up, and disappear only when actually removed.
 */
export class MeasurementRenderer {
  readonly group = new THREE.Group();

  private readonly lineMaterial = new THREE.LineBasicMaterial({
    color: LINE_COLOR,
    depthTest: false,
  });
  private readonly pendingMaterial = new THREE.LineBasicMaterial({
    color: LINE_COLOR,
    opacity: 0.5,
    transparent: true,
    depthTest: false,
  });

  private pending: THREE.Line | null = null;

  constructor() {
    this.group.name = "dxf-measurements";
    this.group.renderOrder = 998;
  }

  /** Rebuild from the records. Cheap: a handful of two-point lines. */
  sync(model: MeasurementModel, document: DxfDocument): void {
    this.clearRecorded();
    for (const measurement of model.all) {
      this.group.add(this.buildMeasurement(measurement, document));
    }
  }

  /** The rubber band between a placed first point and the cursor. */
  setPending(from: THREE.Vector3 | null, to: THREE.Vector3 | null): void {
    if (this.pending) {
      this.group.remove(this.pending);
      this.pending.geometry.dispose();
      this.pending = null;
    }
    if (!from || !to) return;
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    this.pending = new THREE.Line(geometry, this.pendingMaterial);
    this.pending.renderOrder = 998;
    this.group.add(this.pending);
  }

  private buildMeasurement(
    measurement: Measurement,
    document: DxfDocument
  ): THREE.Object3D {
    const from = document.toWorldSpace(
      new THREE.Vector3(measurement.from.x, measurement.from.y, 0)
    );
    const to = document.toWorldSpace(
      new THREE.Vector3(measurement.to.x, measurement.to.y, 0)
    );

    const object = new THREE.Group();
    object.userData.measurementId = measurement.id;

    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geometry, this.lineMaterial);
    line.renderOrder = 999;
    object.add(line);

    // End ticks, perpendicular to the run, scaled to the measurement so they
    // stay proportionate at any zoom.
    const direction = to.clone().sub(from).normalize();
    const normal = new THREE.Vector3(-direction.y, direction.x, 0);
    const size = Math.max(measurement.distance * TICK_SIZE_FRACTION, 1e-6);
    for (const point of [from, to]) {
      const tick = new THREE.BufferGeometry().setFromPoints([
        point.clone().addScaledVector(normal, size),
        point.clone().addScaledVector(normal, -size),
      ]);
      const tickLine = new THREE.Line(tick, this.lineMaterial);
      tickLine.renderOrder = 999;
      object.add(tickLine);
    }

    return object;
  }

  private clearRecorded(): void {
    const recorded = this.group.children.filter(
      (child) => child !== this.pending
    );
    for (const child of recorded) {
      this.group.remove(child);
      child.traverse((node) => {
        (node as Partial<THREE.Mesh>).geometry?.dispose();
      });
    }
  }

  dispose(): void {
    this.clearRecorded();
    this.setPending(null, null);
    this.lineMaterial.dispose();
    this.pendingMaterial.dispose();
  }
}
