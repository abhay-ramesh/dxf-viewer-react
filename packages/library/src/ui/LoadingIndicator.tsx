import React from "react";
import { LoadProgress } from "../pipeline/types";
import { tokens } from "./tokens";

export interface LoadingIndicatorProps {
  loading: boolean;
  progress?: LoadProgress | null;
  className?: string;
}

const PHASE_LABEL: Record<string, string> = {
  parsing: "Reading drawing",
  analysing: "Finding shapes",
  building: "Building geometry",
  complete: "Done",
};

/**
 * Shown while a drawing loads.
 *
 * Only possible now that loading is a phase with progress rather than a
 * synchronous call that froze the page until it was finished.
 */
export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  loading,
  progress,
  className,
}) => {
  if (!loading) return null;
  const ratio = progress?.ratio ?? 0;

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: tokens.spacing(3),
        zIndex: 1003,
        background: "rgba(255, 255, 255, 0.6)",
        backdropFilter: "blur(2px)",
        font: `500 0.875rem ${tokens.fontSans}`,
        color: tokens.text,
      }}
    >
      <div>{PHASE_LABEL[progress?.phase ?? "parsing"] ?? "Loading"}</div>
      <div
        style={{
          width: "min(240px, 60%)",
          height: "4px",
          borderRadius: "2px",
          background: "rgba(0, 0, 0, 0.12)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.round(ratio * 100)}%`,
            height: "100%",
            background: tokens.accent,
            transition: "width 120ms linear",
          }}
        />
      </div>
    </div>
  );
};
