/**
 * The custom element entry: `<dxf-viewer src="/plan.dxf">`.
 *
 * Separate from `./core` so importing the viewer does not define a custom
 * element as a side effect, and separate from `./react` because it needs
 * neither React nor anything React brings.
 */
export {
  DxfViewerElement,
  defineDxfViewerElement,
} from "./element/DxfViewerElement";
