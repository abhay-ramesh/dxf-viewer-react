import { Tool, ToolContext } from "./types";

/**
 * Drag to pan.
 *
 * The tool used to reach into OrbitControls and rewrite its mouse-button and
 * touch tables by numeric constant. The camera controller has one question to
 * answer — may a drag pan the view — so that is all this sets.
 */
export class PanTool implements Tool {
  type = "pan" as const;

  activate({ controls }: ToolContext) {
    controls.dragPanEnabled = true;
  }

  deactivate({ controls }: ToolContext) {
    controls.dragPanEnabled = false;
  }
}
