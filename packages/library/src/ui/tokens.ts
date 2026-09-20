/**
 * The few values the default chrome shares.
 *
 * Deliberately small. This is not a design system — it exists so the stock
 * components look like one another, and so a consumer who wants a different
 * look replaces the components rather than fighting these.
 */
export const tokens = {
  surface: "rgba(255, 255, 255, 0.95)",
  surfaceDark: "rgba(17, 17, 17, 0.88)",
  border: "1px solid rgba(0, 0, 0, 0.1)",
  borderDark: "1px solid rgba(255, 255, 255, 0.12)",
  radius: "8px",
  radiusLarge: "12px",
  shadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
  shadowLarge: "0 4px 20px rgba(0, 0, 0, 0.15)",
  blur: "blur(10px)",
  accent: "#0066cc",
  text: "#333333",
  textInverted: "#ffffff",
  textMuted: "#8f8f8f",
  danger: "#d92d20",
  fontSans:
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontMono: "ui-monospace, SFMono-Regular, Menlo, monospace",
  spacing: (n: number) => `${n * 0.25}rem`,
} as const;

export type Placement =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "bottom-center";

/** Absolute-position styles for a corner or edge of the viewport. */
export function placementStyle(
  placement: Placement,
  inset = "1rem"
): React.CSSProperties {
  const style: React.CSSProperties = { position: "absolute" };
  if (placement.startsWith("top")) style.top = inset;
  else style.bottom = inset;

  if (placement.endsWith("left")) style.left = inset;
  else if (placement.endsWith("right")) style.right = inset;
  else {
    style.left = "50%";
    style.transform = "translateX(-50%)";
  }
  return style;
}
