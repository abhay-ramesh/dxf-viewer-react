import * as THREE from "three";
import { DxfDocument } from "../document/DxfDocument";
import { SnapType } from "../types";

export interface MeasurementPoint {
  /** Drawing coordinates, so a measurement means the same thing tomorrow. */
  x: number;
  y: number;
  /** How this point was placed, when it was snapped to something. */
  snappedTo?: SnapType;
}

export interface Measurement {
  id: string;
  from: MeasurementPoint;
  to: MeasurementPoint;
  /** Distance in drawing units. */
  distance: number;
  dx: number;
  dy: number;
  /** Angle from the positive X axis, in degrees. */
  angle: number;
  /** The drawing's unit name, when the file declared one. */
  units?: string;
  createdAt: number;
}

/**
 * Measurements, kept.
 *
 * A measurement used to be a pair of points inside the tool, replaced by the
 * next one and escaping only as a formatted string and a bare number. Nothing
 * could list them, remove one, export them, or say what unit the number was
 * in — even though the file's $INSUNITS had been parsed and put on screen.
 *
 * Here they are records in the drawing's own coordinate system, with their
 * units attached, which is what makes a list, an undo, and a saved session
 * ordinary rather than special.
 */
export class MeasurementModel {
  private measurements: Measurement[] = [];
  private nextId = 0;
  private units?: string;

  constructor(private readonly onChange: () => void) {}

  /** Tell the model what the drawing's units are, so results can say so. */
  setUnits(units: string | undefined): void {
    this.units = units && units !== "Unitless" ? units : undefined;
  }

  get all(): readonly Measurement[] {
    return this.measurements;
  }

  get count(): number {
    return this.measurements.length;
  }

  get last(): Measurement | undefined {
    return this.measurements[this.measurements.length - 1];
  }

  add(from: MeasurementPoint, to: MeasurementPoint): Measurement {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const measurement: Measurement = {
      id: `m${this.nextId++}`,
      from,
      to,
      dx,
      dy,
      distance: Math.hypot(dx, dy),
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
      units: this.units,
      createdAt: Date.now(),
    };
    this.measurements.push(measurement);
    this.onChange();
    return measurement;
  }

  /** Record a measurement given world-space points, converting as it goes. */
  addFromWorld(
    document: DxfDocument,
    from: THREE.Vector3,
    to: THREE.Vector3,
    snaps: { from?: SnapType; to?: SnapType } = {}
  ): Measurement {
    const a = document.toDocumentSpace(from);
    const b = document.toDocumentSpace(to);
    return this.add(
      { x: a.x, y: a.y, snappedTo: snaps.from },
      { x: b.x, y: b.y, snappedTo: snaps.to }
    );
  }

  remove(id: string): boolean {
    const before = this.measurements.length;
    this.measurements = this.measurements.filter((m) => m.id !== id);
    const removed = this.measurements.length !== before;
    if (removed) this.onChange();
    return removed;
  }

  /** Drop the most recent measurement. */
  undo(): Measurement | undefined {
    const last = this.measurements.pop();
    if (last) this.onChange();
    return last;
  }

  clear(): void {
    if (!this.measurements.length) return;
    this.measurements = [];
    this.onChange();
  }

  /** Sum of every recorded distance — a running total for takeoffs. */
  get total(): number {
    return this.measurements.reduce((sum, m) => sum + m.distance, 0);
  }

  /** Plain records, ready to serialise. */
  toJSON(): Measurement[] {
    return this.measurements.map((m) => ({ ...m }));
  }

  load(measurements: Measurement[]): void {
    this.measurements = measurements.map((m) => ({ ...m }));
    this.nextId = this.measurements.length;
    this.onChange();
  }
}

/** Format a measurement for display, including units when the file gave them. */
export function formatMeasurement(
  measurement: Measurement,
  precision = 2
): string {
  const value = measurement.distance.toFixed(precision);
  return measurement.units ? `${value} ${measurement.units}` : value;
}
