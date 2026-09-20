import React from "react";
import { Measurement, formatMeasurement } from "../core/MeasurementModel";
import { Placement, placementStyle, tokens } from "./tokens";

export interface MeasureReadoutProps {
  /** In-progress distance, or the last completed one. */
  text: string | null;
  /** Every recorded measurement, if you want a running list and a total. */
  measurements?: readonly Measurement[];
  onRemove?: (id: string) => void;
  placement?: Placement;
  className?: string;
}

/**
 * Shows the current measurement, and the recorded ones when there are any.
 *
 * The list is only possible because measurements are records now; when a
 * measurement was a string that erased itself, there was nothing to list.
 */
export const MeasureReadout: React.FC<MeasureReadoutProps> = ({
  text,
  measurements = [],
  onRemove,
  placement = "bottom-center",
  className,
}) => {
  if (!text && !measurements.length) return null;

  const total = measurements.reduce((sum, m) => sum + m.distance, 0);

  return (
    <div
      className={className}
      style={{
        ...placementStyle(placement),
        zIndex: 1000,
        minWidth: "160px",
        padding: `${tokens.spacing(3)} ${tokens.spacing(5)}`,
        background: tokens.surfaceDark,
        color: tokens.textInverted,
        borderRadius: tokens.radius,
        border: tokens.borderDark,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
        backdropFilter: tokens.blur,
        font: `500 0.875rem ${tokens.fontMono}`,
      }}
    >
      {text && <div style={{ whiteSpace: "nowrap" }}>{text}</div>}

      {measurements.length > 0 && (
        <div
          style={{
            marginTop: text ? tokens.spacing(2) : 0,
            paddingTop: text ? tokens.spacing(2) : 0,
            borderTop: text ? tokens.borderDark : undefined,
            fontSize: "0.75rem",
          }}
        >
          {measurements.map((measurement, index) => (
            <div
              key={measurement.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: tokens.spacing(3),
                color: "#c8c8c8",
              }}
            >
              <span>#{index + 1}</span>
              <span>{formatMeasurement(measurement)}</span>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(measurement.id)}
                  title="Remove"
                  style={{
                    background: "none",
                    border: "none",
                    color: tokens.textMuted,
                    cursor: "pointer",
                    padding: 0,
                    font: `inherit`,
                  }}
                >
                  x
                </button>
              )}
            </div>
          ))}
          {measurements.length > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: tokens.spacing(3),
                marginTop: tokens.spacing(1),
                fontWeight: 600,
              }}
            >
              <span>total</span>
              <span>
                {total.toFixed(2)}
                {measurements[0].units ? ` ${measurements[0].units}` : ""}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
