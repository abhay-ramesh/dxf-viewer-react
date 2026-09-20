import React from "react";
import { EntityInfo } from "../types";
import { tokens } from "./tokens";

export interface HoverTooltipProps {
  info: EntityInfo | null;
  x: number;
  y: number;
  className?: string;
}

/** Follows the cursor with the type of whatever is under it. */
export const HoverTooltip: React.FC<HoverTooltipProps> = ({
  info,
  x,
  y,
  className,
}) => {
  if (!info) return null;
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        top: `${y + 20}px`,
        left: `${x + 20}px`,
        zIndex: 1001,
        padding: `${tokens.spacing(2)} ${tokens.spacing(3)}`,
        background: tokens.surfaceDark,
        color: tokens.textInverted,
        borderRadius: "6px",
        font: `500 0.75rem ${tokens.fontSans}`,
        pointerEvents: "none",
      }}
    >
      <strong>{info.type}</strong>
      {info.layer ? (
        <span style={{ color: tokens.textMuted }}> · {info.layer}</span>
      ) : null}
    </div>
  );
};
