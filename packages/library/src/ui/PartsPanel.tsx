import React from "react";
import { PartsReport, partsReportToCsv } from "../analysis/PartsReport";
import { Placement, placementStyle, tokens } from "./tokens";

export interface PartsPanelProps {
  report: PartsReport | null;
  /** Called with CSV text when the reader asks to export. */
  onExport?: (csv: string, filename: string) => void;
  placement?: Placement;
  maxRows?: number;
  className?: string;
}

const number = (value: number, digits = 1) =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/**
 * The drawing as numbers someone can quote from.
 *
 * Every value here already existed inside the viewer — closed outlines, their
 * areas, the holes within them. Showing them is the difference between a
 * viewer that displays a drawing and one that answers the question a
 * fabricator actually opened it to ask.
 */
export const PartsPanel: React.FC<PartsPanelProps> = ({
  report,
  onExport,
  placement = "top-right",
  maxRows = 8,
  className,
}) => {
  if (!report || report.totals.parts === 0) return null;

  const unit = report.units ? ` ${report.units}` : "";

  return (
    <div
      className={className}
      style={{
        ...placementStyle(placement),
        zIndex: 1000,
        minWidth: "300px",
        maxWidth: "380px",
        maxHeight: "calc(100% - 2rem)",
        overflowY: "auto",
        padding: tokens.spacing(4),
        background: tokens.surface,
        color: tokens.text,
        borderRadius: tokens.radiusLarge,
        border: tokens.border,
        boxShadow: tokens.shadowLarge,
        backdropFilter: tokens.blur,
        font: `0.8125rem ${tokens.fontSans}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: `2px solid ${tokens.accent}`,
          paddingBottom: tokens.spacing(2),
          marginBottom: tokens.spacing(3),
          color: tokens.accent,
          font: `600 1rem ${tokens.fontSans}`,
        }}
      >
        Parts
        {onExport && (
          <button
            type="button"
            onClick={() =>
              onExport(partsReportToCsv(report), "parts-report.csv")
            }
            style={{
              marginLeft: "auto",
              padding: `2px ${tokens.spacing(2)}`,
              background: "transparent",
              border: "1px solid currentColor",
              borderRadius: "5px",
              color: "inherit",
              cursor: "pointer",
              font: `500 0.75rem ${tokens.fontSans}`,
            }}
          >
            CSV
          </button>
        )}
      </div>

      <Summary label="parts" value={String(report.totals.parts)} />
      <Summary label="holes" value={String(report.totals.holes)} />
      <Summary
        label={`net area${unit ? ` ${report.units}²` : ""}`}
        value={number(report.totals.netArea)}
      />
      <Summary
        label={`cut length${unit}`}
        value={number(report.totals.cutLength)}
      />

      <table
        style={{
          width: "100%",
          marginTop: tokens.spacing(3),
          borderCollapse: "collapse",
          font: `0.75rem ${tokens.fontMono}`,
        }}
      >
        <thead>
          <tr style={{ color: tokens.textMuted, textAlign: "right" }}>
            <th style={{ textAlign: "left", fontWeight: 500 }}>#</th>
            <th style={{ fontWeight: 500 }}>size</th>
            <th style={{ fontWeight: 500 }}>holes</th>
            <th style={{ fontWeight: 500 }}>cut</th>
          </tr>
        </thead>
        <tbody>
          {report.parts.slice(0, maxRows).map((part, index) => (
            <tr key={part.id} style={{ textAlign: "right" }}>
              <td style={{ textAlign: "left", color: tokens.textMuted }}>
                {index + 1}
              </td>
              <td>
                {number(part.width, 0)}×{number(part.height, 0)}
              </td>
              <td>{part.holes}</td>
              <td>{number(part.cutLength, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {report.parts.length > maxRows && (
        <div
          style={{
            marginTop: tokens.spacing(2),
            color: tokens.textMuted,
            fontSize: "0.75rem",
          }}
        >
          +{report.parts.length - maxRows} more — export for the full list
        </div>
      )}
    </div>
  );
};

const Summary: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
    <span style={{ color: tokens.textMuted }}>{label}</span>
    <span style={{ fontFamily: tokens.fontMono }}>{value}</span>
  </div>
);
