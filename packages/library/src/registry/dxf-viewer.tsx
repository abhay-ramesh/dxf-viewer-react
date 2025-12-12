import { useDxfViewer } from "dxf-viewer-react";
import { Maximize2, MousePointer2, Ruler } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface DxfViewerProps extends React.HTMLAttributes<HTMLDivElement> {
  dxfContent: string | null;
  config?: {
    backgroundColor?: string;
    entityColor?: string;
    showGrid?: boolean;
    showAxes?: boolean;
  };
}

export function DxfViewer({
  dxfContent,
  config,
  className,
  ...props
}: DxfViewerProps) {
  const {
    containerRef,
    currentTool,
    setCurrentTool,
    hoverInfo,
    selectedEntityInfo,
    measureText,
    stats,
    error,
  } = useDxfViewer({
    dxfContent,
    backgroundColor: config?.backgroundColor,
    entityColor: config?.entityColor,
    showGrid: config?.showGrid,
    showAxes: config?.showAxes,
  });

  return (
    <Card
      className={cn("w-full overflow-hidden border-0", className)}
      {...props}
    >
      <div className="relative aspect-video w-full bg-slate-50 dark:bg-slate-950">
        {/* Canvas Container */}
        <div ref={containerRef} className="absolute inset-0 h-full w-full" />

        {/* Toolbar */}
        <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <Button
            variant={currentTool === "pan" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setCurrentTool("pan")}
            title="Pan Tool"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button
            variant={currentTool === "select" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setCurrentTool("select")}
            title="Select Tool"
          >
            <MousePointer2 className="h-4 w-4" />
          </Button>
          <Button
            variant={currentTool === "measure" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setCurrentTool("measure")}
            title="Measure Tool"
          >
            <Ruler className="h-4 w-4" />
          </Button>
        </div>

        {/* Measurement Overlay */}
        {measureText && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-black/80 px-3 py-1.5 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
            {measureText}
          </div>
        )}

        {/* Hover Info Tooltip */}
        {hoverInfo && (
          <div
            className="pointer-events-none absolute z-50 rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md ring-1 ring-inset ring-border"
            style={{
              top: hoverInfo.y + 20,
              left: hoverInfo.x + 20,
            }}
          >
            <p className="font-semibold">{hoverInfo.info.type}</p>
            {hoverInfo.info.length && (
              <p className="opacity-80">
                L: {hoverInfo.info.length.toFixed(2)}
              </p>
            )}
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
            <Card className="max-w-md border-destructive/50 bg-destructive/10">
              <CardHeader>
                <CardTitle className="text-destructive">
                  Error Loading DXF
                </CardTitle>
                <CardDescription>{error}</CardDescription>
              </CardHeader>
            </Card>
          </div>
        )}
      </div>

      {/* Info Panel */}
      {(selectedEntityInfo || Object.keys(stats).length > 0) && (
        <div className="border-t bg-muted/30 p-4">
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div className="space-y-1">
              <p className="font-medium text-muted-foreground">Units</p>
              <p>{stats.DXF_UNITS || "Unknown"}</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-muted-foreground">Grid Size</p>
              <p>{stats.GRID_SIZE || "-"}</p>
            </div>
            {selectedEntityInfo && (
              <>
                <div className="space-y-1">
                  <p className="font-medium text-muted-foreground">Selected</p>
                  <p>{selectedEntityInfo.type}</p>
                </div>
                {selectedEntityInfo.length !== undefined && (
                  <div className="space-y-1">
                    <p className="font-medium text-muted-foreground">Length</p>
                    <p>{selectedEntityInfo.length.toFixed(3)}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
