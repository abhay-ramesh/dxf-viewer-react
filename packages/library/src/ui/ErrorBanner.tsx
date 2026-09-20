import React from "react";
import { Placement, placementStyle, tokens } from "./tokens";

export interface ErrorBannerProps {
  error: string | null;
  onDismiss?: () => void;
  placement?: Placement;
  className?: string;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  error,
  onDismiss,
  placement = "top-left",
  className,
}) => {
  if (!error) return null;
  return (
    <div
      className={className}
      role="alert"
      style={{
        ...placementStyle(placement),
        zIndex: 1002,
        display: "flex",
        alignItems: "center",
        gap: tokens.spacing(3),
        maxWidth: "min(32rem, calc(100% - 2rem))",
        padding: `${tokens.spacing(3)} ${tokens.spacing(4)}`,
        background: tokens.danger,
        color: tokens.textInverted,
        borderRadius: tokens.radius,
        boxShadow: tokens.shadow,
        font: `500 0.875rem ${tokens.fontSans}`,
      }}
    >
      <span>{error}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          x
        </button>
      )}
    </div>
  );
};
