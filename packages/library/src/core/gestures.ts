/**
 * What the user meant by a wheel event.
 *
 * Browsers do not say which device produced a wheel event, and the two
 * devices want opposite things: on a trackpad, two fingers moving means pan
 * and a pinch means zoom; on a mouse, the one wheel there is means zoom.
 * Treating every wheel as zoom — which is all OrbitControls can do — makes a
 * trackpad feel wild, because one gentle two-finger flick is thirty events.
 */
export type WheelIntent =
  | { kind: "zoom"; amount: number; x: number; y: number }
  | { kind: "pan"; dx: number; dy: number };

export type WheelBehavior = "auto" | "zoom" | "pan";

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  clientX: number;
  clientY: number;
}

const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 800;

/**
 * Wheel travel, in pixels, for one e-fold of zoom.
 *
 * Calibrated so a mouse notch (100px) changes scale by about 18%, which is
 * close to what Figma and Google Maps do, and so a pinch — which reports far
 * smaller deltas — moves at a comparable rate under the fingers.
 */
const WHEEL_DIVISOR = 500;
const PINCH_DIVISOR = 100;

/** Wheel deltas arrive in lines or pages on some platforms. Normalise first. */
export function pixelDelta(event: WheelLike): { dx: number; dy: number } {
  const scale =
    event.deltaMode === 1
      ? LINE_HEIGHT_PX
      : event.deltaMode === 2
        ? PAGE_HEIGHT_PX
        : 1;
  return { dx: event.deltaX * scale, dy: event.deltaY * scale };
}

/**
 * Accumulates evidence about which device is in use.
 *
 * No single event is conclusive, but a session is: only a trackpad produces
 * horizontal deltas or fractional ones, and a mouse wheel's deltas are
 * large and evenly divisible. Deciding once per session and remembering is
 * far steadier than re-deciding per event, which makes gestures flicker
 * between pan and zoom mid-flick.
 */
export class DeviceHeuristic {
  private sawTrackpadSignal = false;
  private sawMouseSignal = false;

  observe(event: WheelLike): void {
    if (event.ctrlKey) return; // A pinch tells us nothing about the device.

    if (event.deltaX !== 0 || !Number.isInteger(event.deltaY)) {
      this.sawTrackpadSignal = true;
      return;
    }
    // Chrome reports 100 per notch, Firefox 3 lines, others 120.
    const magnitude = Math.abs(event.deltaY);
    if (event.deltaMode !== 0 || magnitude >= 100) {
      this.sawMouseSignal = true;
    }
  }

  /** True once we have seen something only a trackpad does. */
  get isTrackpad(): boolean {
    return this.sawTrackpadSignal && !this.sawMouseSignal;
  }

  get isMouse(): boolean {
    return this.sawMouseSignal && !this.sawTrackpadSignal;
  }

  reset(): void {
    this.sawTrackpadSignal = false;
    this.sawMouseSignal = false;
  }
}

export interface ClassifyOptions {
  behavior: WheelBehavior;
  device: DeviceHeuristic;
  /** How much a pixel of wheel travel zooms. */
  zoomSpeed: number;
}

/**
 * Turn a wheel event into an intent.
 *
 * Rules, in order:
 *
 *   1. Ctrl or Cmd held — including the synthetic ctrlKey browsers set for a
 *      trackpad pinch — always means zoom. This is the one signal every
 *      platform agrees on.
 *   2. An explicit `behavior` of "zoom" or "pan" wins over any guess.
 *   3. A mouse wheel means zoom, because that is the only thing it can mean.
 *   4. Anything else is a trackpad scroll, which means pan. Shift swaps the
 *      axis, as it does everywhere else.
 */
export function classifyWheel(
  event: WheelLike,
  options: ClassifyOptions
): WheelIntent {
  const { dx, dy } = pixelDelta(event);
  const pinch = event.ctrlKey || event.metaKey;

  const zoom = () => ({
    kind: "zoom" as const,
    // Exponential in travel, so the same flick zooms by the same ratio
    // whether it arrives as one big event or thirty small ones. A pinch
    // reports much smaller deltas than a wheel notch, so it gets its own
    // scale rather than feeling dead.
    amount: Math.exp(
      (-dy * options.zoomSpeed) / (pinch ? PINCH_DIVISOR : WHEEL_DIVISOR)
    ),
    x: event.clientX,
    y: event.clientY,
  });

  const pan = (): WheelIntent => {
    // Shift-scroll pans horizontally on devices that only report a Y delta.
    if (event.shiftKey && dx === 0) return { kind: "pan", dx: dy, dy: 0 };
    return { kind: "pan", dx, dy };
  };

  // 1. Ctrl or Cmd — including the synthetic ctrlKey browsers set for a
  //    trackpad pinch — always means zoom. Every platform agrees on this one.
  if (pinch) return zoom();

  // 2. An explicit choice beats any guess.
  if (options.behavior === "zoom") return zoom();
  if (options.behavior === "pan") return pan();

  // 3. What we have learned about the device this session.
  if (options.device.isMouse) return zoom();
  if (options.device.isTrackpad) return pan();

  // 4. Nothing learned yet: judge this event alone. Line-mode or a large
  //    round delta is a wheel notch; anything small and smooth is fingers.
  const looksLikeWheelNotch = event.deltaMode !== 0 || Math.abs(dy) >= 100;
  return looksLikeWheelNotch ? zoom() : pan();
}
