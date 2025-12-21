import { Tool, ToolContext } from "./types";

export class PanTool implements Tool {
  type = "pan" as const;

  activate({ controls }: ToolContext) {
    controls.enablePan = true;
    controls.enableRotate = false;
    controls.mouseButtons.LEFT = 2; // THREE.MOUSE.PAN
    controls.mouseButtons.MIDDLE = 2; // THREE.MOUSE.PAN - middle mouse for panning
    controls.touches.ONE = 2; // THREE.TOUCH.PAN
  }

  deactivate({ controls }: ToolContext) {
    controls.enablePan = false;
    controls.mouseButtons.LEFT = null; // No action
    controls.touches.ONE = 0; // No action
  }
}
