import React from "react";
import { DrawingReport } from "../document/DrawingReport";
import { Placement, placementStyle, tokens } from "./tokens";

export interface OmissionNoticeProps {
  report: DrawingReport | null;
  placement?: Placement;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Says what the viewer could not draw.
 *
 * A drawing with dimensions used to render as though it had none. Telling the
 * reader "4 DIMENSION (not supported yet)" turns a mystery into a known
 * limitation — which is the difference between a viewer someone distrusts and
 * one they work around.
 */
export const OmissionNotice: React.FC<OmissionNoticeProps> = ({
  report,
  placement = "top-left",
  onDismiss,
  className,
}) => {
  const summary = report?.summarise();
  if (!summary) return null;

  return (
    <div
      className={className}
      role="status"
      style={{
        ...placementStyle(placement),
        zIndex: 1001,
        display: "flex",
        alignItems: "center",
        gap: tokens.spacing(3),
        maxWidth: "min(30rem, calc(100% - 2rem))",
        padding: `${tokens.spacing(2)} ${tokens.spacing(3)}`,
        background: "rgba(255, 180, 84, 0.95)",
        color: "#3d2a00",
        borderRadius: tokens.radius,
        boxShadow: tokens.shadow,
        font: `500 0.8125rem ${tokens.fontSans}`,
      }}
    >
      <span>{summary}</span>
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
