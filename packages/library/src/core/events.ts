import { EntityId } from "../document/types";
import { EntityInfo } from "../types";

/**
 * Everything the core announces.
 *
 * Tools emit into this map rather than being handed React setState closures
 * through their constructors, so a new tool needs no new props on the
 * component and no new state in the hook.
 */
export interface ViewerEvents {
  "document:loaded": { entityCount: number; stats: Record<string, number> };
  "document:error": { error: Error };
  "selection:change": { ids: EntityId[]; primary: EntityInfo | null };
  "hover:change": { id: EntityId | null; info: EntityInfo | null; x: number; y: number };
  "measure:update": { distance: number | null; text: string | null };
  "measure:complete": { distance: number; text: string };
  "tool:change": { tool: string };
  "camera:change": Record<string, never>;
  "layers:change": Record<string, never>;
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
