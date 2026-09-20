import React from "react";
import { FrameStats } from "../core/PerformanceMonitor";

export interface StatsOverlayProps {
  stats: FrameStats | null;
  /** Corner to pin the readout to. */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  className?: string;
}

/**
 * The frame readout.
 *
 * It deliberately does not lead with a big FPS number. This viewer renders on
 * demand, so at rest it draws nothing and any honest FPS counter reads zero —
 * which is the goal, not a fault. The headline is therefore the state
 * (idle or live) and the cost of a frame when one is drawn.
 */
export const StatsOverlay: React.FC<StatsOverlayProps> = ({
  stats,
  position = "top-left",
  className,
}) => {
  if (!stats) return null;

  const vertical = position.startsWith("top")
    ? { top: "0.75rem" }
    : { bottom: "0.75rem" };
  const horizontal = position.endsWith("left")
    ? { left: "0.75rem" }
    : { right: "0.75rem" };

  const health = frameHealth(stats);

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        ...vertical,
        ...horizontal,
        zIndex: 1002,
        minWidth: "168px",
        padding: "0.5rem 0.625rem",
        borderRadius: "8px",
        background: "rgba(17, 17, 17, 0.82)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        color: "#e8e8e8",
        font: "500 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.375rem",
          marginBottom: "0.375rem",
          fontSize: "12px",
          fontWeight: 600,
          color: health.color,
        }}
      >
        <span
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: health.color,
            boxShadow: `0 0 6px ${health.color}`,
          }}
        />
        {stats.idle ? "idle" : `${stats.fps} fps`}
        <span style={{ marginLeft: "auto", color: "#9a9a9a", fontWeight: 500 }}>
          {stats.idle ? "0 draws/s" : `${stats.frameTime.toFixed(1)} ms`}
        </span>
      </div>

      <Row label="avg / worst">
        {stats.averageFrameTime.toFixed(1)} / {stats.worstFrameTime.toFixed(1)}{" "}
        ms
      </Row>
      <Row label="draw calls" emphasis={stats.drawCalls > 500}>
        {stats.drawCalls.toLocaleString()}
      </Row>
      <Row label="lines / tris">
        {stats.lines.toLocaleString()} / {stats.triangles.toLocaleString()}
      </Row>
      <Row label="geometries">{stats.geometries.toLocaleString()}</Row>
      <Row label="entities">{stats.entities.toLocaleString()}</Row>
    </div>
  );
};

const Row: React.FC<{
  label: string;
  emphasis?: boolean;
  children: React.ReactNode;
}> = ({ label, emphasis, children }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
    <span style={{ color: "#8f8f8f" }}>{label}</span>
    <span style={{ color: emphasis ? "#ffb454" : "#e8e8e8" }}>{children}</span>
  </div>
);

/**
 * Idle is healthy, not stalled. When we are drawing, judge by frame cost
 * rather than frame rate: on-demand rendering produces low frame counts by
 * design, so a low fps number says nothing on its own.
 */
function frameHealth(stats: FrameStats): { color: string } {
  if (stats.idle) return { color: "#6ea8fe" };
  if (stats.averageFrameTime > 32) return { color: "#ff6b6b" };
  if (stats.averageFrameTime > 16) return { color: "#ffb454" };
  return { color: "#51cf66" };
}
