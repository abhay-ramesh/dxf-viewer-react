import { DxfViewerCore } from "../core/DxfViewerCore";
import { decodeViewState, encodeViewState } from "../core/ViewState";
import { loadDocument, LoadAbortedError } from "../pipeline/loadDocument";
import { StyleResolver } from "../style/StyleResolver";
import { MeasureTool, PanTool, SelectTool } from "../tools";

/**
 * `<dxf-viewer>` — the viewer as a custom element.
 *
 * One artifact that works in Vue, Svelte, Angular, Astro, a Rails or Django
 * template, and plain HTML with no build step at all. Writing four framework
 * bindings would cover fewer cases for more code, and every one of them would
 * need maintaining; the browser already has a component model.
 *
 * ```html
 * <dxf-viewer src="/plan.dxf" tool="pan"></dxf-viewer>
 * ```
 *
 * Attributes are the API, events are the output, and the underlying
 * {@link DxfViewerCore} stays reachable for anything the attributes do not
 * cover.
 */
export class DxfViewerElement extends HTMLElement {
  static readonly observedAttributes = [
    "src",
    "content",
    "background",
    "entity-color",
    "tool",
    "grid",
    "axes",
    "fills",
    "interactive",
    "wheel-behavior",
  ] as const;

  /** The viewer. Null until the element is connected to a document. */
  core: DxfViewerCore | null = null;

  private container: HTMLDivElement | null = null;
  private style_: StyleResolver = new StyleResolver();
  private loadToken = 0;
  private pendingContent: string | null = null;

  connectedCallback(): void {
    if (this.core) return;

    if (!this.style.position || this.style.position === "static") {
      this.style.position = "relative";
    }
    if (!this.style.display) this.style.display = "block";

    this.container = document.createElement("div");
    this.container.style.width = "100%";
    this.container.style.height = "100%";
    this.appendChild(this.container);

    this.core = new DxfViewerCore(this.container, {
      style: this.style_,
      ...this.coreOptions(),
    });
    this.core.registerTool(new PanTool());
    this.core.registerTool(
      new SelectTool(
        (info) => this.emit("select", { info }),
        (info, x, y) => this.emit("hover", { info, x, y })
      )
    );
    this.core.registerTool(
      new MeasureTool(
        (distance) => this.emit("measure", { distance }),
        undefined,
        (text) => this.emit("measure-text", { text })
      )
    );
    this.core.setTool(this.getAttribute("tool") ?? "pan");

    if (this.pendingContent !== null) {
      void this.load(this.pendingContent);
      this.pendingContent = null;
    } else {
      const src = this.getAttribute("src");
      if (src) void this.loadFrom(src);
      const content = this.getAttribute("content");
      if (content) void this.load(content);
    }
  }

  disconnectedCallback(): void {
    this.core?.dispose();
    this.core = null;
    this.style_.dispose();
    if (this.container?.parentElement === this) {
      this.removeChild(this.container);
    }
    this.container = null;
  }

  attributeChangedCallback(
    name: string,
    previous: string | null,
    next: string | null
  ): void {
    if (previous === next || !this.core) return;

    if (name === "src" && next) {
      void this.loadFrom(next);
      return;
    }
    if (name === "content" && next !== null) {
      void this.load(next);
      return;
    }
    if (name === "tool") {
      this.core.setTool(next ?? "pan");
      return;
    }

    // A colour change means a new resolver, and the document has to be
    // rebuilt through it for the change to reach the vertices.
    if (name === "entity-color" || name === "background") {
      this.style_.dispose();
      this.style_ = new StyleResolver({
        backgroundColor: this.getAttribute("background") ?? undefined,
        entityColor: this.getAttribute("entity-color") ?? undefined,
      });
      this.core.setOptions({ style: this.style_, ...this.coreOptions() });
      void this.reload();
      return;
    }

    this.core.setOptions(this.coreOptions());
    if (name === "fills") void this.reload();
  }

  // ------------------------------------------------------------- public API

  /** Load DXF text directly, for content that never lived at a URL. */
  async load(content: string): Promise<void> {
    if (!this.core) {
      this.pendingContent = content;
      return;
    }

    const token = ++this.loadToken;
    this.lastContent = content;
    this.emit("loading", {});

    try {
      const result = await loadDocument(content, {
        style: this.style_,
        showShapeColors: this.boolAttribute("fills", true),
        onProgress: (progress) => this.emit("progress", progress),
      });
      // A newer load started while this one was in flight.
      if (token !== this.loadToken || !this.core) return;

      this.core.setDocument(result);
      this.emit("load", {
        entities: result.document.size,
        omitted: result.report.summarise(),
      });
    } catch (error) {
      if (error instanceof LoadAbortedError) return;
      this.emit("error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Fetch and load a URL. */
  async loadFrom(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      await this.load(await response.text());
    } catch (error) {
      this.emit("error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Frame the whole drawing. */
  fit(): void {
    this.core?.fitToContent();
  }

  /** The visible state, as a string suitable for a URL or storage. */
  get viewState(): string | null {
    const state = this.core?.captureView();
    return state ? encodeViewState(state) : null;
  }

  set viewState(encoded: string | null) {
    if (!encoded || !this.core) return;
    const state = decodeViewState(encoded);
    if (state) this.core.restoreView(state);
  }

  // --------------------------------------------------------------- internals

  private lastContent: string | null = null;

  private async reload(): Promise<void> {
    if (this.lastContent !== null) await this.load(this.lastContent);
  }

  private coreOptions() {
    return {
      backgroundColor: this.getAttribute("background") ?? undefined,
      showGrid: this.boolAttribute("grid", true),
      showAxes: this.boolAttribute("axes", true),
      interactive: this.boolAttribute("interactive", true),
      wheelBehavior:
        (this.getAttribute("wheel-behavior") as
          | "auto"
          | "zoom"
          | "pan"
          | null) ?? undefined,
    };
  }

  /** `grid="false"` turns it off; a bare `grid` or absence leaves the default. */
  private boolAttribute(name: string, fallback: boolean): boolean {
    const value = this.getAttribute(name);
    if (value === null) return fallback;
    if (value === "" || value === "true") return true;
    return value !== "false";
  }

  private emit(type: string, detail: unknown): void {
    this.dispatchEvent(
      new CustomEvent(`dxf-${type}`, { detail, bubbles: true, composed: true })
    );
  }
}

/**
 * Register the element.
 *
 * Not done on import: defining a custom element is a global side effect, and
 * a library should not take a name in the host's registry without being
 * asked.
 */
export function defineDxfViewerElement(tag = "dxf-viewer"): void {
  if (typeof customElements === "undefined") return;
  if (customElements.get(tag)) return;
  customElements.define(tag, DxfViewerElement);
}
