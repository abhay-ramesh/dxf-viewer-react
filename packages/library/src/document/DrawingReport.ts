/** Why an entity did not make it onto the screen. */
export type OmissionReason =
  | "unsupported-type"
  | "empty-geometry"
  | "failed"
  | "missing-block"
  /** The parser dropped it before the viewer ever saw it. */
  | "not-parsed";

export interface Omission {
  type: string;
  reason: OmissionReason;
  count: number;
  /** One example message, when the reason was a failure. */
  detail?: string;
}

const REASON_TEXT: Record<OmissionReason, string> = {
  "unsupported-type": "not supported yet",
  "empty-geometry": "no drawable geometry",
  failed: "failed to build",
  "missing-block": "referenced a block the file does not contain",
  "not-parsed": "not read by the parser",
};

/**
 * What the viewer could not draw.
 *
 * Unsupported entities — DIMENSION, HATCH, LEADER, SOLID, 3DFACE — used to
 * vanish with a `console.warn` into the host application's console. A drawing
 * with dimensions rendered as though it had none, and nothing said so. That is
 * the kind of silence that makes someone stop trusting a viewer: they cannot
 * tell the difference between "this drawing has no dimensions" and "this
 * viewer does not show them".
 *
 * This collects the omissions as data so a consumer can put them on screen.
 */
export class DrawingReport {
  private readonly omissions = new Map<string, Omission>();
  private drawn = 0;

  recordDrawn(): void {
    this.drawn++;
  }

  record(type: string, reason: OmissionReason, detail?: string): void {
    const key = `${type}:${reason}`;
    const existing = this.omissions.get(key);
    if (existing) {
      existing.count++;
      if (!existing.detail && detail) existing.detail = detail;
      return;
    }
    this.omissions.set(key, { type, reason, count: 1, detail });
  }

  /** Most-frequent first, so the biggest gap reads at the top. */
  get all(): Omission[] {
    return [...this.omissions.values()].sort((a, b) => b.count - a.count);
  }

  get omittedCount(): number {
    return this.all.reduce((sum, omission) => sum + omission.count, 0);
  }

  get drawnCount(): number {
    return this.drawn;
  }

  get isComplete(): boolean {
    return this.omissions.size === 0;
  }

  /** Entity types that were dropped, ignoring why. */
  get omittedTypes(): string[] {
    return [...new Set(this.all.map((omission) => omission.type))];
  }

  /** One line a consumer can show without writing any formatting code. */
  summarise(): string | null {
    if (this.isComplete) return null;
    const parts = this.all.map(
      (omission) =>
        `${omission.count} ${omission.type} (${REASON_TEXT[omission.reason]})`
    );
    return `Could not display ${parts.join(", ")}`;
  }

  toJSON(): { drawn: number; omitted: Omission[] } {
    return { drawn: this.drawn, omitted: this.all };
  }
}
