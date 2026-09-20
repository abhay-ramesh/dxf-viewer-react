import * as THREE from "three";
import { formatMeasurement } from "../core/MeasurementModel";
import { SnapType } from "../types";
import { Tool, ToolContext } from "./types";

/** Screen-space snap radius. Pixels, because that is what the user aims in. */
const SNAP_PIXELS = 12;

const SNAP_COLORS: Record<SnapType, number> = {
  endpoint: 0xff0000,
  midpoint: 0x00ffff,
  center: 0xffff00,
  quadrant: 0xff00ff,
  intersection: 0x00ff00,
  nearest: 0xaaaaaa,
};

/**
 * Place two points and record the distance between them.
 *
 * The tool used to own snapping, the rendered line, the formatted string and
 * the single pair of points that the next measurement overwrote — and it
 * erased its own result after two seconds, because the drawing *was* the
 * state. It now reads the shared snap service, writes a record to the
 * measurement model, and lets the renderer draw whatever the model holds.
 */
export class MeasureTool implements Tool {
  type = "measure" as const;

  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  private anchor: THREE.Vector3 | null = null;
  private anchorSnap: SnapType | undefined;

  private indicator: THREE.Mesh;

  constructor(
    private onMeasureComplete?: (distance: number) => void,
    private onMeasureUpdate?: (distance: number | null) => void,
    private onMeasureDisplay?: (text: string | null) => void
  ) {
    this.indicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 12, 12),
      new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
      })
    );
    this.indicator.visible = false;
    this.indicator.renderOrder = 1000;
  }

  activate({ controls, scene }: ToolContext) {
    // A drag belongs to this tool, not to the camera; wheel zoom and
    // space-drag still work.
    controls.dragPanEnabled = false;
    scene.add(this.indicator);
    this.reset();
  }

  deactivate({ controls, scene, measurements }: ToolContext) {
    controls.dragPanEnabled = true;
    scene.remove(this.indicator);
    this.reset();
    this.onMeasureDisplay?.(
      measurements.last ? formatMeasurement(measurements.last) : null
    );
  }

  private reset(): void {
    this.anchor = null;
    this.anchorSnap = undefined;
    this.indicator.visible = false;
  }

  /** Where the cursor is on the drawing plane, snapped if anything is close. */
  private resolvePoint(
    event: MouseEvent,
    context: ToolContext
  ): { point: THREE.Vector3; snappedTo?: SnapType } {
    const { camera, renderer, snapping, viewportHeight } = context;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(ndc, camera);
    const onPlane = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.plane, onPlane);

    const tolerance = snapping.worldTolerance(
      camera,
      viewportHeight,
      SNAP_PIXELS
    );
    const snap = snapping.snap(onPlane, tolerance);
    if (!snap) return { point: onPlane };
    return { point: snap.point.clone(), snappedTo: snap.type };
  }

  /** Shift constrains the run to horizontal or vertical, as CAD ortho does. */
  private constrain(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
    const constrained = to.clone();
    if (Math.abs(to.x - from.x) > Math.abs(to.y - from.y)) {
      constrained.y = from.y;
    } else {
      constrained.x = from.x;
    }
    return constrained;
  }

  onMouseMove(event: MouseEvent, context: ToolContext) {
    const { point, snappedTo } = this.resolvePoint(event, context);
    const current =
      event.shiftKey && this.anchor
        ? this.constrain(this.anchor, point)
        : point;

    this.indicator.position.copy(current);
    this.indicator.visible = true;
    const material = this.indicator.material as THREE.MeshBasicMaterial;
    material.color.setHex(snappedTo ? SNAP_COLORS[snappedTo] : 0x00ff00);
    material.opacity = snappedTo ? 1 : 0.5;

    if (!this.anchor) {
      context.renderer.domElement.style.cursor = "crosshair";
      return;
    }

    context.measurementRenderer?.setPending(this.anchor, current);
    const distance = this.anchor.distanceTo(current);
    this.onMeasureUpdate?.(distance);
    this.onMeasureDisplay?.(distance.toFixed(2));
  }

  onMouseDown(event: MouseEvent, context: ToolContext) {
    const { point, snappedTo } = this.resolvePoint(event, context);

    if (!this.anchor) {
      this.anchor = point;
      this.anchorSnap = snappedTo;
      return;
    }

    const end = event.shiftKey ? this.constrain(this.anchor, point) : point;
    const measurement = context.measurements.addFromWorld(
      context.document,
      this.anchor,
      end,
      { from: this.anchorSnap, to: snappedTo }
    );

    context.measurementRenderer?.setPending(null, null);
    this.reset();

    this.onMeasureComplete?.(measurement.distance);
    this.onMeasureUpdate?.(measurement.distance);
    this.onMeasureDisplay?.(formatMeasurement(measurement));
  }

  /** Escape abandons a half-placed measurement; Backspace undoes the last. */
  onKeyDown(event: KeyboardEvent, context: ToolContext) {
    if (event.key === "Escape") {
      context.measurementRenderer?.setPending(null, null);
      this.reset();
      this.onMeasureDisplay?.(null);
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      context.measurements.undo();
      const last = context.measurements.last;
      this.onMeasureDisplay?.(last ? formatMeasurement(last) : null);
    }
  }
}
