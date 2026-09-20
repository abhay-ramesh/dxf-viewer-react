import * as THREE from "three";

export type ColorInput = string | number | THREE.Color;

/** How the viewer is currently presenting an entity. */
export type InteractionState = "normal" | "hover" | "selected";

/** What is being coloured. Strokes and fills resolve differently. */
export type StyleKind = "stroke" | "fill";

export interface StyleSubject {
  kind: StyleKind;
  type: string;
  layer: string;
  /** The entity's own ACI index, if it carries one. 256 = ByLayer, 0 = ByBlock. */
  colorIndex?: number;
  /** The entity's own 24-bit colour, if the parser resolved one. */
  rgb?: number;
  /** Colour of the INSERT this entity was expanded from, for ByBlock. */
  blockColor?: number;
  /** Position in the fill sequence, for palette-style `shapeColors`. */
  shapeIndex?: number;
}

export interface ResolvedStyle {
  color: number;
  opacity: number;
  transparent: boolean;
}

export type ShapeColorInput =
  | ColorInput
  | ColorInput[]
  | ((index: number) => ColorInput);

export interface StyleOptions {
  /**
   * The canvas colour, used to keep achromatic strokes visible.
   *
   * A drawing authored on a black CAD canvas has white layers; without this
   * it would render white-on-white.
   */
  backgroundColor?: ColorInput;
  /**
   * Force every stroke to one colour.
   *
   * Leave unset to honour the drawing's own ByLayer colours, which is what a
   * CAD application does.
   */
  entityColor?: ColorInput;
  /** Colour for generated fills: one colour, a cycling palette, or a function. */
  shapeColors?: ShapeColorInput;
  hoverColor?: ColorInput;
  selectionColor?: ColorInput;
  /** Override specific layers by name. Outranks everything but interaction state. */
  layerColors?: Record<string, ColorInput>;
  /** Final say. Return a partial style to patch the resolved one. */
  resolve?: (
    subject: StyleSubject,
    state: InteractionState
  ) => Partial<ResolvedStyle> | undefined | void;
}
