import { EntityId } from "../document/types";
import { EntityInfo } from "../types";
import { DrawingReport } from "../document/DrawingReport";
import { Measurement } from "./MeasurementModel";
import { FrameStats } from "./PerformanceMonitor";

/**
 * Everything the core announces.
 *
 * Tools emit into this map rather than being handed React setState closures
 * through their constructors, so a new tool needs no new props on the
 * component and no new state in the hook.
 */
export interface ViewerEvents {
  "document:loaded": {
    entityCount: number;
    stats: Record<string, number>;
    /** What could not be drawn, and why. */
    report: DrawingReport;
  };
  "document:error": { error: Error };
  "selection:change": { ids: EntityId[]; primary: EntityInfo | null };
  "hover:change": { id: EntityId | null; info: EntityInfo | null; x: number; y: number };
  "measure:update": { distance: number | null; text: string | null };
  "measure:complete": { distance: number; text: string };
  /** The recorded set changed: added, removed, undone or cleared. */
  "measure:change": { measurements: Measurement[] };
  "tool:change": { tool: string };
  "camera:change": Record<string, never>;
  "layers:change": Record<string, never>;
  /** Frame timing and renderer counters. Only emitted while monitoring. */
  "stats:frame": FrameStats;
}

export type ViewerEventName = keyof ViewerEvents;

type Listener<K extends ViewerEventName> = (payload: ViewerEvents[K]) => void;

/** Minimal typed emitter. No dependency, no wildcard, no bubbling. */
export class Emitter {
  private listeners = new Map<ViewerEventName, Set<Listener<never>>>();

  on<K extends ViewerEventName>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => {
      set!.delete(listener as Listener<never>);
    };
  }

  emit<K extends ViewerEventName>(event: K, payload: ViewerEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Copy first: a listener may unsubscribe itself while we iterate.
    for (const listener of [...set]) {
      (listener as Listener<K>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
