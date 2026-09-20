# ADR 001 — Redesigning the viewer around four primitives

Status: in progress (steps 1–3 landed)
Date: 2026-09-20

## Context

Every feature since the first release was attached to the surface of the
library: a new prop on `DxfViewerProps`, a new `useState` in `useDxfViewer`, a
new branch inside a tool class. That worked until it didn't. Selection could
only hold one entity because selection *was* a swapped material. Measurements
escaped as a formatted string. Layer visibility lived in two places at once.
Colour was decided in five.

The common cause is that four primitives were missing. Adding them turns most
of the "bolted-on" features into consequences of the core rather than
additions to it.

## The four primitives

### 1. Entity identity and a document index — landed

Entities had no ids and no link back from a rendered object to the parsed
entity, so `SelectTool` re-derived length from buffer attributes and centre
from a recomputed bounding sphere on every hover.

`DxfDocument` assigns an id at the one point where an entity becomes a
renderable, computes its geometry facts once there, and owns the
object → entity lookup.

Derived geometry is in **document space**, and the origin shift `processDxf`
applies is recorded as `worldOffset`. Before this, every coordinate the viewer
reported was silently offset by `-EXTMIN`.

### 2. A viewer core that owns the GL context — landed

`renderer`, `scene`, `camera` and `controls` were each a `useMemo` over props,
so the viewer was rebuilt whenever a prop changed — resizing the window
rebuilt the camera and discarded the user's pan and zoom.

`DxfViewerCore` creates them once, for the lifetime of the container, and
mutates them in place. It imports nothing from React. It also carries the tool
registry, the event bus, and the render scheduler.

### 3. One style cascade — landed

`StyleResolver` answers "what colour is this" for strokes, fills, hover,
selection and theming, implementing DXF's ByLayer/ByBlock semantics that were
previously absent.

### 4. An async document pipeline — next

`processDxf` runs synchronously inside a `useMemo` during render. See
"Threading" below.

## Consequences for features

| Was bolted on | Becomes |
| --- | --- |
| `ToolType` as a closed union, tools constructed in a `useMemo` | tool registry + typed events |
| Single selection stored as swapped materials | a set of entity ids in state |
| `toggleLayer` mutating a group *and* React state | layer view-state owned in one place |
| `snapDistance = 5` **world** units inside `MeasureTool` | zoom-aware snap service on the core |
| One measurement, escaping as a string | measurements as document-space data, with units |
| `interactive?: boolean` | capabilities derived from registered tools |
| `toDataURL` on the live canvas | render-to-target at any resolution |
| Inline-styled chrome inside `DxfViewer.tsx` | headless core + opt-in UI |

## Performance

Measured on `packages/demo/public/test.dxf` — 345 KB, 940 entities.

| | Before | After |
| --- | --- | --- |
| Library bundle | 968 KB | **168 KB** (36.6 KB gzipped) |
| GL draw calls per second, idle | 28,200 | **0** |
| Draw calls per frame | 977 | 977 (next) |
| Total vertices | 30,894 | 30,894 |
| `processDxf` | 148 ms | 148 ms (next) |
| Materials | 1 shared + 1 per fill | shared by appearance |

### Should we use WebAssembly?

**Not yet, and probably not for parsing.** The measurements do not support it.

The drawing is 30,894 vertices — trivial for a GPU — issued as 977 draw calls.
The bottleneck is call overhead and JS object allocation, neither of which
WASM addresses. A WASM DXF parser also has to hand its results back across the
JS boundary; unless the output stays in flat binary form, marshalling costs
more than the parse saves.

Revisit only if profiling names a specific hot kernel. Candidates, in order:
spline evaluation (De Boor), polygon triangulation, and the point-in-polygon
containment used for hole detection. Keep those functions pure and
typed-array-shaped so a WASM implementation can be dropped in behind the same
signature without touching callers.

The honest summary: **data layout and draw-call batching are worth an order of
magnitude here; WASM is worth a few percent.** Do the first.

### Threading

**Yes — a worker, but for the pipeline, not the renderer.**

`processDxf` blocks for 148 ms on a 345 KB file, which extrapolates to roughly
four seconds on a 10 MB one, with no progress and no cancellation, inside a
`useMemo` during render.

The design that works:

1. Parse and tessellate in a worker. The pipeline is nearly pure already —
   string in, geometry out.
2. Return **transferable `Float32Array`s**, not Three.js objects. Geometry
   construction on the main thread from a transferred buffer is microseconds;
   structured-cloning an object graph is not.
3. Rebuild `BufferGeometry` on the main thread and hand it to the core.
4. Make the task cancellable, so switching files mid-parse does not leave two
   parses racing.

`OffscreenCanvas` — rendering entirely in a worker — is a later option. It
complicates picking and controls, and the idle cost is already zero, so it
solves a problem we no longer have.

### The lightweight, performant list, in order of payoff

1. **~~Ship three as a peer dependency~~** — done. 968 KB → 168 KB.
2. **~~Render on demand~~** — done. 28,200 idle GL calls/sec → 0.
3. **Batch geometry by layer and material.** 977 draw calls become roughly one
   per layer. This is the single largest frame-time win, and it is *why*
   selection-as-state and the style resolver come first: you cannot swap a
   material per object once objects are merged, so selection has to move to a
   vertex attribute or an overlay.
4. **Instance repeated blocks.** An INSERT used 500 times should be one
   `InstancedMesh`, not 500 objects.
5. **Move parsing to a worker** (above).
6. **Spatial index for picking.** `raycaster.intersectObjects(children, true)`
   is linear in entity count on every mouse move. An R-tree over the document
   bounding boxes makes hover O(log n), and it is the same index snapping
   needs.
7. **Avoid per-entity JS objects.** A struct-of-arrays index over typed arrays
   beats 940 heap objects for both memory and cache behaviour.
8. **LOD and frustum culling** for drawings large enough to need them. Not
   this drawing.

## Sequence

1. Entity identity and the document index — **landed**
2. `DxfViewerCore` — **landed**
3. Style cascade — **landed**
4. Selection as state, tool registry, event bus — in progress
5. Async pipeline, then snapping as a service, then measurements as data
6. Split the UI out of the core

Steps 3, 4 and 6 break the public API, which argues for releasing 1–2 as a
0.2.x and batching the rest into 0.3.0 with a migration note.
