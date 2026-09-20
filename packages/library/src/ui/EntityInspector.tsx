import React from "react";
import { EntityInfo } from "../types";
import { Placement, placementStyle, tokens } from "./tokens";

export interface EntityInspectorProps {
  selection: EntityInfo | null;
  /** How many entities are selected, when more than one can be. */
  selectedCount?: number;
  /** Drawing-level facts: units, version, counts. */
  stats?: Record<string, number | string>;
  showDrawingInfo?: boolean;
  placement?: Placement;
  className?: string;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
    <span style={{ color: tokens.textMuted }}>{label}</span>
    <span>{children}</span>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div style={{ marginBottom: tokens.spacing(4) }}>
    <div
      style={{
        borderBottom: `2px solid ${tokens.accent}`,
        paddingBottom: tokens.spacing(2),
        marginBottom: tokens.spacing(3),
        color: tokens.accent,
        font: `600 1rem ${tokens.fontSans}`,
      }}
    >
      {title}
    </div>
    {children}
  </div>
);

/** Properties of the selection, and of the drawing. */
export const EntityInspector: React.FC<EntityInspectorProps> = ({
  selection,
  selectedCount = 0,
  stats,
  showDrawingInfo = false,
  placement = "top-right",
  className,
}) => {
  if (!selection && !showDrawingInfo) return null;

  return (
    <div
      className={className}
      style={{
        ...placementStyle(placement),
        zIndex: 1000,
        minWidth: "280px",
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
        font: `0.875rem ${tokens.fontSans}`,
      }}
    >
      {showDrawingInfo && stats && (
        <Section title="Drawing">
          <Row label="units">{String(stats.DXF_UNITS ?? "Unknown")}</Row>
          {stats.DXF_UNITS_FORMAT && (
            <Row label="format">{String(stats.DXF_UNITS_FORMAT)}</Row>
          )}
          {stats.DXF_VERSION && (
            <Row label="version">{String(stats.DXF_VERSION)}</Row>
          )}
        </Section>
      )}

      {selection && (
        <Section
          title={selectedCount > 1 ? `Selection (${selectedCount})` : "Selection"}
        >
          <Row label="type">{selection.type}</Row>
          <Row label="layer">{selection.layer}</Row>
          {selection.length !== undefined && (
            <Row label="length">{selection.length.toFixed(2)}</Row>
          )}
          {selection.area !== undefined && (
            <Row label="area">{selection.area.toFixed(2)}</Row>
          )}
          {selection.radius !== undefined && (
            <Row label="radius">{selection.radius.toFixed(2)}</Row>
          )}
          {selection.center && (
            <Row label="centre">
              {selection.center.x.toFixed(2)}, {selection.center.y.toFixed(2)}
            </Row>
          )}
        </Section>
      )}
    </div>
  );
};
