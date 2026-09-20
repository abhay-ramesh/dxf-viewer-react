import { describe, expect, it } from "bun:test";
import {
  classifyWheel,
  DeviceHeuristic,
  pixelDelta,
  WheelLike,
} from "../src/core/gestures";

const wheel = (over: Partial<WheelLike> = {}): WheelLike => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  clientX: 100,
  clientY: 100,
  ...over,
});

const classify = (event: WheelLike, device = new DeviceHeuristic()) =>
  classifyWheel(event, { behavior: "auto", device, zoomSpeed: 1 });

describe("pixelDelta", () => {
  it("passes pixel mode through", () => {
    expect(pixelDelta(wheel({ deltaY: 42 }))).toEqual({ dx: 0, dy: 42 });
  });

  it("scales line and page modes into pixels", () => {
    expect(pixelDelta(wheel({ deltaY: 3, deltaMode: 1 })).dy).toBe(48);
    expect(pixelDelta(wheel({ deltaY: 1, deltaMode: 2 })).dy).toBe(800);
  });
});

describe("DeviceHeuristic", () => {
  it("knows nothing at first", () => {
    const device = new DeviceHeuristic();
    expect(device.isTrackpad).toBe(false);
    expect(device.isMouse).toBe(false);
  });

  it("treats a horizontal delta as proof of a trackpad", () => {
    const device = new DeviceHeuristic();
    device.observe(wheel({ deltaX: 3, deltaY: 1 }));
    expect(device.isTrackpad).toBe(true);
  });

  it("treats a fractional delta as proof of a trackpad", () => {
    const device = new DeviceHeuristic();
    device.observe(wheel({ deltaY: 4.5 }));
    expect(device.isTrackpad).toBe(true);
  });

  it("treats a large round delta as a mouse wheel", () => {
    const device = new DeviceHeuristic();
    device.observe(wheel({ deltaY: 100 }));
    expect(device.isMouse).toBe(true);
  });

  it("treats line mode as a mouse wheel", () => {
    const device = new DeviceHeuristic();
    device.observe(wheel({ deltaY: 3, deltaMode: 1 }));
    expect(device.isMouse).toBe(true);
  });

  it("ignores pinch events, which say nothing about the device", () => {
    const device = new DeviceHeuristic();
    device.observe(wheel({ deltaY: 2, ctrlKey: true }));
    expect(device.isTrackpad).toBe(false);
    expect(device.isMouse).toBe(false);
  });

  it("resets", () => {
    const device = new DeviceHeuristic();
    device.observe(wheel({ deltaX: 5 }));
    device.reset();
    expect(device.isTrackpad).toBe(false);
  });
});

describe("classifyWheel", () => {
  it("zooms on ctrl, which is what a trackpad pinch reports", () => {
    const intent = classify(wheel({ deltaY: -5, ctrlKey: true }));
    expect(intent.kind).toBe("zoom");
  });

  it("zooms on cmd", () => {
    expect(classify(wheel({ deltaY: -5, metaKey: true })).kind).toBe("zoom");
  });

  it("pans for a trackpad two-finger scroll", () => {
    const device = new DeviceHeuristic();
    device.observe(wheel({ deltaX: 2, deltaY: 6 }));
    const intent = classify(wheel({ deltaX: 2, deltaY: 6 }), device);
    expect(intent).toEqual({ kind: "pan", dx: 2, dy: 6 });
  });

  it("zooms for a mouse wheel notch", () => {
    const device = new DeviceHeuristic();
    device.observe(wheel({ deltaY: 100 }));
    expect(classify(wheel({ deltaY: 100 }), device).kind).toBe("zoom");
  });

  it("guesses sensibly before it has learned anything", () => {
    // A small smooth delta is fingers.
    expect(classify(wheel({ deltaY: 6 })).kind).toBe("pan");
    // A big round one is a notch.
    expect(classify(wheel({ deltaY: 120 })).kind).toBe("zoom");
  });

  it("honours an explicit behaviour over any guess", () => {
    const device = new DeviceHeuristic();
    device.observe(wheel({ deltaX: 3 })); // Looks like a trackpad.
    const zoomed = classifyWheel(wheel({ deltaY: 5 }), {
      behavior: "zoom",
      device,
      zoomSpeed: 1,
    });
    expect(zoomed.kind).toBe("zoom");

    const panned = classifyWheel(wheel({ deltaY: 100 }), {
      behavior: "pan",
      device,
      zoomSpeed: 1,
    });
    expect(panned.kind).toBe("pan");
  });

  it("still zooms on ctrl even when told to pan", () => {
    const panned = classifyWheel(wheel({ deltaY: 5, ctrlKey: true }), {
      behavior: "pan",
      device: new DeviceHeuristic(),
      zoomSpeed: 1,
    });
    expect(panned.kind).toBe("zoom");
  });

  it("swaps the axis for shift-scroll on a Y-only device", () => {
    const device = new DeviceHeuristic();
    device.observe(wheel({ deltaX: 1 }));
    const intent = classify(wheel({ deltaY: 30, shiftKey: true }), device);
    expect(intent).toEqual({ kind: "pan", dx: 30, dy: 0 });
  });

  it("zooms in when scrolling up and out when scrolling down", () => {
    const zoomIn = classify(wheel({ deltaY: -100 }));
    const zoomOut = classify(wheel({ deltaY: 100 }));
    expect(zoomIn.kind).toBe("zoom");
    expect(zoomOut.kind).toBe("zoom");
    if (zoomIn.kind === "zoom" && zoomOut.kind === "zoom") {
      expect(zoomIn.amount).toBeGreaterThan(1);
      expect(zoomOut.amount).toBeLessThan(1);
    }
  });

  it("is exponential, so the same travel zooms the same regardless of chunking", () => {
    const device = new DeviceHeuristic();
    const one = classifyWheel(wheel({ deltaY: -120 }), {
      behavior: "zoom",
      device,
      zoomSpeed: 1,
    });

    // The same 120px of travel delivered as 30 small events.
    let product = 1;
    for (let i = 0; i < 30; i++) {
      const step = classifyWheel(wheel({ deltaY: -4 }), {
        behavior: "zoom",
        device,
        zoomSpeed: 1,
      });
      if (step.kind === "zoom") product *= step.amount;
    }

    if (one.kind === "zoom") {
      expect(product).toBeCloseTo(one.amount, 6);
    }
  });

  it("scales with zoomSpeed", () => {
    const device = new DeviceHeuristic();
    const slow = classifyWheel(wheel({ deltaY: -100 }), {
      behavior: "zoom",
      device,
      zoomSpeed: 0.5,
    });
    const fast = classifyWheel(wheel({ deltaY: -100 }), {
      behavior: "zoom",
      device,
      zoomSpeed: 2,
    });
    if (slow.kind === "zoom" && fast.kind === "zoom") {
      expect(fast.amount).toBeGreaterThan(slow.amount);
    }
  });

  it("gives a mouse notch a sane step rather than a jump", () => {
    const intent = classifyWheel(wheel({ deltaY: -100 }), {
      behavior: "zoom",
      device: new DeviceHeuristic(),
      zoomSpeed: 1,
    });
    if (intent.kind === "zoom") {
      // About 22% in, i.e. a fifth of the view per notch. Not 5x.
      expect(intent.amount).toBeGreaterThan(1.1);
      expect(intent.amount).toBeLessThan(1.4);
    }
  });

  it("does not let one gentle trackpad flick zoom wildly", () => {
    // The old behaviour: 30 events of OrbitControls' per-event step.
    const device = new DeviceHeuristic();
    device.observe(wheel({ deltaX: 1, deltaY: 4 }));

    let zoomEvents = 0;
    for (let i = 0; i < 30; i++) {
      const intent = classify(wheel({ deltaX: 1, deltaY: 4 }), device);
      if (intent.kind === "zoom") zoomEvents++;
    }
    expect(zoomEvents).toBe(0);
  });
});
