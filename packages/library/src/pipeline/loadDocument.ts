import { processDxf } from "../processDxf";
import { prepareDrawing } from "./prepare";
import { LoadOptions, LoadResult } from "./types";

/** Thrown when a load is cancelled. Matches the DOM's AbortError convention. */
export class LoadAbortedError extends Error {
  readonly name = "AbortError";
  constructor() {
    super("Load aborted");
  }
}

/** Hand the event loop a turn, so the browser can paint between phases. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new LoadAbortedError();
}

/**
 * Load a drawing without freezing the page, and let the caller call it off.
 *
 * `processDxf` ran synchronously inside a `useMemo` during render, so a large
 * file froze the tab with no progress and no way to cancel, and switching
 * files mid-load left two loads racing to be last.
 *
 * The work is split into phases with a yield between them: the browser can
 * paint a loading state, and cancellation is checked at each boundary.
 *
 * Measured on the 940-entity demo drawing after the endpoint indexing fix:
 * parsing ~7 ms, analysis ~25 ms, geometry ~45 ms. Those are small enough
 * that the default runs on this thread. `options.prepare` is the seam for
 * drawings where they are not: `PreparedDrawing` is plain, cloneable data
 * precisely so a worker can produce it.
 */
export async function loadDocument(
  content: string,
  options: LoadOptions
): Promise<LoadResult> {
  const {
    style,
    showShapeColors = true,
    signal,
    onProgress,
    prepare,
  } = options;

  throwIfAborted(signal);
  onProgress?.({ phase: "parsing", ratio: 0 });
  await yieldToBrowser();
  throwIfAborted(signal);

  const prepared = prepare
    ? await prepare(content, { showShapeColors, signal })
    : prepareDrawing(content, { showShapeColors });

  throwIfAborted(signal);
  onProgress?.({ phase: "analysing", ratio: 0.35 });
  await yieldToBrowser();
  throwIfAborted(signal);

  onProgress?.({ phase: "building", ratio: 0.65 });
  const result = processDxf(content, { style, showShapeColors, prepared });

  throwIfAborted(signal);
  onProgress?.({ phase: "complete", ratio: 1 });
  return result;
}
