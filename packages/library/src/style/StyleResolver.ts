import * as THREE from "three";
import { aciToRgb, COLOR_BY_BLOCK, COLOR_BY_LAYER } from "./aci";
import { autoFillColor } from "./palette";
import {
  InteractionState,
  ResolvedStyle,
  StyleOptions,
  StyleSubject,
} from "./types";

const FALLBACK = 0xffffff;

/** Perceived brightness, 0 (black) to 1 (white). */
function luminance(rgb: number): number {
  const r = ((rgb >> 16) & 0xff) / 255;
  const g = ((rgb >> 8) & 0xff) / 255;
  const b = (rgb & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** How far a colour is from grey, 0 (achromatic) to 1. */
function chroma(rgb: number): number {
  const r = ((rgb >> 16) & 0xff) / 255;
  const g = ((rgb >> 8) & 0xff) / 255;
  const b = (rgb & 0xff) / 255;
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function toRgb(value: string | number | THREE.Color): number {
  if (typeof value === "number") return value;
  return new THREE.Color(value).getHex();
}

/**
 * Decides what colour everything is, in one place.
 *
 * Before this existed, five unrelated pieces of code each answered part of
 * the question: one global material for lines, a separate mini-DSL for fills,
 * hardcoded red and green inside the select tool, a layer table that mangled
 * its own colours, and an auto-palette for shapes. Hover, selection, theming
 * and DXF's own ByLayer/ByBlock semantics are now the same mechanism.
 *
 * Precedence, highest first:
 *
 *   1. a caller-supplied `resolve` hook
 *   2. the interaction state (hover, selected) — a display state outranks
 *      whatever the entity would otherwise be
 *   3. an explicit per-layer override
 *   4. an explicit global override (`entityColor` for strokes, `shapeColors`
 *      for fills)
 *   5. the entity's own colour, if it carries one
 *   6. the layer's colour — DXF's ByLayer default
 *   7. white
 */
export class StyleResolver {
  private readonly materials = new Map<string, THREE.Material>();

  private layerTable: Record<string, { color?: number; colorIndex?: number }>;

  constructor(
    private readonly options: StyleOptions = {},
    layerTable: Record<string, { color?: number; colorIndex?: number }> = {}
  ) {
    this.layerTable = layerTable;
  }

  /** Supply the drawing's layer table once it has been parsed. */
  setLayerTable(
    table: Record<string, { color?: number; colorIndex?: number }>
  ): void {
    this.layerTable = table;
  }

  resolve(
    subject: StyleSubject,
    state: InteractionState = "normal"
  ): ResolvedStyle {
    const base: ResolvedStyle = {
      color: this.contrastWithBackground(this.baseColor(subject)),
      opacity: subject.kind === "fill" ? 0.85 : 1,
      transparent: subject.kind === "fill",
    };

    const stateStyle = this.stateColor(state);
    if (stateStyle !== undefined) {
      base.color = stateStyle;
      if (state === "hover") {
        base.opacity = subject.kind === "fill" ? 0.5 : 0.7;
        base.transparent = true;
      }
    }

    const custom = this.options.resolve?.(subject, state);
    return custom ? { ...base, ...custom } : base;
  }

  private stateColor(state: InteractionState): number | undefined {
    if (state === "selected") {
      return toRgb(this.options.selectionColor ?? 0xff0000);
    }
    if (state === "hover") {
      return toRgb(this.options.hoverColor ?? 0x00ff00);
    }
    return undefined;
  }

  /**
   * Keep a colour visible against the current background.
   *
   * CAD applications do not render ACI 7 as literal white: it is "white or
   * black, whichever contrasts", which is why a drawing authored on a black
   * canvas still reads on a white one. Honouring ByLayer without this makes
   * white-on-white drawings invisible.
   *
   * Only the achromatic extremes are flipped. A red line stays red.
   */
  private contrastWithBackground(color: number): number {
    const background = this.options.backgroundColor;
    if (background === undefined) return color;

    const backgroundLuma = luminance(toRgb(background));
    const colorLuma = luminance(color);
    if (Math.abs(colorLuma - backgroundLuma) > 0.25) return color;

    const saturation = chroma(color);
    if (saturation > 0.15) return color; // Chromatic: leave it alone.

    return backgroundLuma > 0.5 ? 0x000000 : 0xffffff;
  }

  private baseColor(subject: StyleSubject): number {
    const layerOverride = this.options.layerColors?.[subject.layer];
    if (layerOverride !== undefined) return toRgb(layerOverride);

    if (subject.kind === "fill") {
      const fill = this.fillColor(subject.shapeIndex ?? 0);
      if (fill !== undefined) return fill;
    } else if (this.options.entityColor !== undefined) {
      return toRgb(this.options.entityColor);
    }

    const own = this.entityOwnColor(subject);
    if (own !== undefined) return own;

    return this.layerColor(subject.layer);
  }

  /** A colour the entity carries itself, honouring ByLayer and ByBlock. */
  private entityOwnColor(subject: StyleSubject): number | undefined {
    const { colorIndex, rgb } = subject;
    if (colorIndex === COLOR_BY_LAYER) return undefined;
    if (colorIndex === COLOR_BY_BLOCK) {
      // ByBlock resolves against the INSERT's own colour; with none, the
      // layer decides.
      return subject.blockColor;
    }
    if (typeof rgb === "number") return rgb;
    if (typeof colorIndex === "number") return aciToRgb(colorIndex);
    return undefined;
  }

  layerColor(layer: string): number {
    const entry = this.layerTable[layer];
    if (!entry) return FALLBACK;
    // dxf-parser resolves layer colour to true RGB; the index is a fallback.
    if (typeof entry.color === "number") return entry.color;
    if (typeof entry.colorIndex === "number") return aciToRgb(entry.colorIndex);
    return FALLBACK;
  }

  /**
   * The `shapeColors` option, which accepts a colour, a palette, or a
   * function. With none of those, generated fills get an automatic palette
   * that keeps neighbouring shapes distinguishable.
   */
  private fillColor(index: number): number | undefined {
    const source = this.options.shapeColors;
    if (source === undefined) return autoFillColor(index);
    if (typeof source === "function") return toRgb(source(index));
    if (Array.isArray(source)) {
      return source.length ? toRgb(source[index % source.length]) : undefined;
    }
    return toRgb(source);
  }

  // ------------------------------------------------------------- materials

  /**
   * Materials are shared by appearance, not created per entity.
   *
   * A drawing with nine layers needs nine line materials, not 940.
   */
  lineMaterial(style: ResolvedStyle): THREE.LineBasicMaterial {
    return this.cached(
      `line:${style.color}:${style.opacity}`,
      () =>
        new THREE.LineBasicMaterial({
          color: style.color,
          opacity: style.opacity,
          transparent: style.transparent,
        })
    ) as THREE.LineBasicMaterial;
  }

  meshMaterial(style: ResolvedStyle): THREE.MeshBasicMaterial {
    return this.cached(
      `mesh:${style.color}:${style.opacity}`,
      () =>
        new THREE.MeshBasicMaterial({
          color: style.color,
          opacity: style.opacity,
          transparent: style.transparent,
          side: THREE.DoubleSide,
        })
    ) as THREE.MeshBasicMaterial;
  }

  private cached(key: string, create: () => THREE.Material): THREE.Material {
    const existing = this.materials.get(key);
    if (existing) return existing;
    const material = create();
    this.materials.set(key, material);
    return material;
  }

  get materialCount(): number {
    return this.materials.size;
  }

  dispose(): void {
    this.materials.forEach((material) => material.dispose());
    this.materials.clear();
  }
}
