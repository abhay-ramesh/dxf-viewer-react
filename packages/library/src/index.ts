export { DxfViewer } from "./DxfViewer";
export { useDxfViewer } from "./useDxfViewer";
export type { DxfViewerProps } from "./types";

// Document model: stable entity identity, derived geometry, and lookups.
export { DxfDocument } from "./document/DxfDocument";
export type {
  DerivedGeometry,
  EntityId,
  IndexedEntity,
} from "./document/types";
