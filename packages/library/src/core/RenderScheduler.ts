/**
 * Renders only when something changed.
 *
 * The previous loop called requestAnimationFrame unconditionally and rendered
 * every frame forever, burning a GPU pass and a wake-up 60 times a second on a
 * drawing that was not moving. Every mutation path now calls `invalidate()`
 * instead, and a frame is drawn only if one is owed.
 *
 * Continuous mode exists for the duration of an interaction — OrbitControls
 * damping needs a frame per tick while it settles.
 */
export class RenderScheduler {
  private frameHandle: number | null = null;
  private dirty = false;
  private continuousHolders = 0;
  private disposed = false;

  constructor(private readonly render: () => void) {}

  /** Request a single frame. Cheap and idempotent within a frame. */
  invalidate(): void {
    if (this.disposed) return;
    this.dirty = true;
    this.schedule();
  }

  /**
   * Hold the loop open for a continuous interaction. Returns the release
   * function; the loop stops when every holder has released.
   */
  holdContinuous(): () => void {
    this.continuousHolders++;
    this.schedule();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.continuousHolders--;
    };
  }

  get isRunning(): boolean {
    return this.frameHandle !== null;
  }

  /** True while an interaction is holding the loop open. */
  get isHeld(): boolean {
    return this.continuousHolders > 0;
  }

  private schedule(): void {
    if (this.frameHandle !== null || this.disposed) return;
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    this.frameHandle = null;
    if (this.disposed) return;

    if (this.dirty || this.continuousHolders > 0) {
      this.dirty = false;
      this.render();
    }

    // Keep the loop alive only while an interaction is holding it open.
    if (this.continuousHolders > 0) this.schedule();
  };

  dispose(): void {
    this.disposed = true;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    this.continuousHolders = 0;
  }
}
