import React from "react";
import { Placement, placementStyle, tokens } from "./tokens";

export interface ToolbarItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  title?: string;
}

export interface ToolbarProps {
  /**
   * The tools to offer.
   *
   * A list, not a hardcoded three buttons: the core's tool registry accepts
   * any tool, so the toolbar has to be able to show any tool.
   */
  items: ToolbarItem[];
  value: string | null;
  onChange: (id: string) => void;
  placement?: Placement;
  className?: string;
  style?: React.CSSProperties;
}

/** The stock tool switcher. Replaceable: it takes data, not the viewer. */
export const Toolbar: React.FC<ToolbarProps> = ({
  items,
  value,
  onChange,
  placement = "bottom-left",
  className,
  style,
}) => {
  if (!items.length) return null;

  return (
    <div
      className={className}
      style={{
        ...placementStyle(placement),
        display: "flex",
        gap: tokens.spacing(2),
        padding: tokens.spacing(2),
        background: tokens.surface,
        borderRadius: tokens.radius,
        boxShadow: tokens.shadow,
        border: tokens.border,
        backdropFilter: tokens.blur,
        ...style,
      }}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            title={item.title ?? item.label}
            aria-pressed={active}
            style={{
              display: "flex",
              alignItems: "center",
              gap: tokens.spacing(1.5),
              padding: `${tokens.spacing(2)} ${tokens.spacing(3)}`,
              background: active ? tokens.accent : "transparent",
              color: active ? tokens.textInverted : tokens.text,
              border: active ? "none" : "1px solid #e0e0e0",
              borderRadius: "6px",
              cursor: "pointer",
              font: `500 0.875rem ${tokens.fontSans}`,
              transition: "all 0.2s ease",
            }}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
};
