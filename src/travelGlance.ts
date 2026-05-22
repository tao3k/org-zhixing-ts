import type { AppDomNodes } from "./appDom";
import type { ResizeTriggerAxis } from "@zag-js/floating-panel";

const travelCardSelector = "[data-travel-card]";
const travelTemplateSelector = "template[data-travel-glance-template]";
const interactiveSelector = "a, button, iframe, input, select, textarea, [role='button']";
const resizeAxes: ResizeTriggerAxis[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

type FloatingPanelModule = typeof import("@zag-js/floating-panel");
type VanillaModule = typeof import("@zag-js/vanilla");

type FloatingPanelRuntime = {
  floatingPanel: FloatingPanelModule;
  VanillaMachine: VanillaModule["VanillaMachine"];
  normalizeProps: VanillaModule["normalizeProps"];
  spreadProps: VanillaModule["spreadProps"];
};

type FloatingPanelApi = ReturnType<FloatingPanelModule["connect"]>;

type MasonryInstance = {
  destroy?: () => void;
  layout?: () => void;
  reloadItems?: () => void;
};

type MasonryConstructor = new (
  element: Element,
  options?: {
    columnWidth?: string;
    gutter?: number;
    horizontalOrder?: boolean;
    itemSelector?: string;
    percentPosition?: boolean;
    transitionDuration?: number | string;
  },
) => MasonryInstance;

type ActiveGlance = {
  close: () => void;
  destroy: () => void;
};

let activeGlance: ActiveGlance | null = null;
let openRequest = 0;
let floatingPanelRuntimePromise: Promise<FloatingPanelRuntime> | null = null;
let masonryRuntimePromise: Promise<MasonryConstructor> | null = null;

export const bindTravelGlance = (dom: AppDomNodes, signal: AbortSignal): void => {
  dom.view.addEventListener("click", handleTravelClick, { signal });
  dom.view.addEventListener("keydown", handleTravelCardKeydown, { signal });
  signal.addEventListener("abort", () => activeGlance?.destroy(), { once: true });
};

export const prefetchTravelGlanceRuntime = (): void => {
  void Promise.all([loadFloatingPanelRuntime(), loadMasonryRuntime()]);
};

const handleTravelClick = (event: Event): void => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }

  const mapToggle = target.closest<HTMLButtonElement>("button[data-travel-map-toggle]");
  if (mapToggle) {
    event.preventDefault();
    toggleTravelMap(mapToggle);
    return;
  }

  const card = target.closest<HTMLElement>(travelCardSelector);
  const interactive = target.closest(interactiveSelector);
  if (card && (!interactive || interactive === card)) {
    event.preventDefault();
    void openTravelGlance(card);
  }
};

const handleTravelCardKeydown = (event: KeyboardEvent): void => {
  const target = event.target instanceof Element ? event.target : null;
  const card = target?.closest<HTMLElement>(travelCardSelector);
  const interactive = target?.closest(interactiveSelector);
  if (
    !card ||
    (interactive && interactive !== card) ||
    (event.key !== "Enter" && event.key !== " ")
  ) {
    return;
  }
  event.preventDefault();
  void openTravelGlance(card);
};

const openTravelGlance = async (card: HTMLElement): Promise<void> => {
  const template = card.querySelector<HTMLTemplateElement>(travelTemplateSelector);
  if (!template) {
    return;
  }

  const request = ++openRequest;
  activeGlance?.destroy();
  const runtime = await loadFloatingPanelRuntime();
  if (request !== openRequest || !card.isConnected) {
    return;
  }

  const root = document.createElement("div");
  root.className = "travel-glance-dialog";
  root.innerHTML = `
    <div class="travel-glance-backdrop" data-travel-glance-backdrop></div>
    <div class="travel-glance-positioner" data-travel-glance-positioner>
      <aside class="travel-glance-layer" data-travel-glance-content>
        <div class="travel-glance-shell">
          <header class="travel-glance-toolbar" data-travel-glance-header>
            <div data-travel-glance-drag>
              <span>Zen Glance</span>
              <strong data-travel-glance-title>${escapeText(card.dataset.travelTitle ?? "Travel preview")}</strong>
            </div>
            <div class="travel-glance-controls" data-no-drag>
              <button type="button" data-travel-glance-stage="default">Restore</button>
              <button type="button" data-travel-glance-stage="maximized">Maximize</button>
              <button type="button" data-travel-glance-close>Close</button>
            </div>
          </header>
          <div class="travel-glance-body" data-travel-glance-body></div>
          ${resizeAxes
            .map(
              (axis) =>
                `<span class="travel-glance-resize-trigger travel-glance-resize-trigger--${axis}" data-travel-glance-resize="${axis}" aria-hidden="true"></span>`,
            )
            .join("")}
        </div>
      </aside>
    </div>
  `;

  const nodes = glanceNodes(root);
  if (!nodes) {
    return;
  }

  const cleanups: Array<() => void> = [];
  const propCleanups: Array<() => void> = [];
  let unsubscribe = (): void => {};
  let destroyed = false;
  let stopMachine = (): void => {};
  let panelApi: FloatingPanelApi | null = null;

  const destroy = (): void => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    cleanups.splice(0).forEach((cleanup) => cleanup());
    propCleanups.splice(0).forEach((cleanup) => cleanup());
    unsubscribe();
    stopMachine();
    root.remove();
    if (activeGlance?.destroy === destroy) {
      activeGlance = null;
    }
  };

  nodes.body.append(template.content.cloneNode(true));
  root.style.visibility = "hidden";
  document.body.append(root);
  loadMapFrames(root);

  const panelRect = zenPanelRect();
  const machine = new runtime.VanillaMachine(runtime.floatingPanel.machine, {
    id: "travel-glance",
    allowOverflow: false,
    closeOnEscape: true,
    defaultSize: panelRect.size,
    draggable: true,
    finalFocusEl: () => card,
    getAnchorPosition: () => zenPanelRect().position,
    getBoundaryEl: () => root,
    gridSize: 4,
    maxSize: panelRect.maxSize,
    minSize: panelRect.minSize,
    persistRect: false,
    resizable: true,
    restoreFocus: true,
    translations: {
      maximize: "Maximize Zen Glance",
      minimize: "Minimize Zen Glance",
      restore: "Restore Zen Glance",
    },
    onOpenChange({ open }) {
      if (!open) {
        queueMicrotask(destroy);
      }
    },
  });
  stopMachine = () => machine.stop();

  const api = (): FloatingPanelApi => {
    panelApi = runtime.floatingPanel.connect(machine.service, runtime.normalizeProps);
    return panelApi;
  };

  const syncPanelProps = (): void => {
    propCleanups.splice(0).forEach((cleanup) => cleanup());
    const connected = api();
    nodes.backdrop.hidden = !connected.open;
    nodes.backdrop.dataset.state = connected.open ? "open" : "closed";
    propCleanups.push(
      runtime.spreadProps(nodes.positioner, connected.getPositionerProps()),
      runtime.spreadProps(nodes.content, connected.getContentProps()),
      runtime.spreadProps(nodes.header, connected.getHeaderProps()),
      runtime.spreadProps(nodes.drag, connected.getDragTriggerProps()),
      runtime.spreadProps(nodes.title, connected.getTitleProps()),
      runtime.spreadProps(nodes.body, connected.getBodyProps()),
      runtime.spreadProps(nodes.close, connected.getCloseTriggerProps()),
      runtime.spreadProps(nodes.maximize, connected.getStageTriggerProps({ stage: "maximized" })),
      runtime.spreadProps(nodes.restore, connected.getStageTriggerProps({ stage: "default" })),
      ...nodes.resizeTriggers.map((trigger) =>
        runtime.spreadProps(
          trigger.element,
          connected.getResizeTriggerProps({ axis: trigger.axis }),
        ),
      ),
    );
  };

  const resizePanel = (): void => {
    const connected = api();
    const nextRect = zenPanelRect();
    connected.setSize(nextRect.size);
    connected.setPosition(nextRect.position);
  };
  nodes.backdrop.addEventListener("click", () => panelApi?.setOpen(false));
  window.addEventListener("resize", resizePanel);
  cleanups.push(() => window.removeEventListener("resize", resizePanel));

  machine.start();
  unsubscribe = machine.subscribe(syncPanelProps);
  syncPanelProps();
  api().setOpen(true);

  try {
    await initializeTravelMasonry(root, cleanups);
  } catch (error) {
    destroy();
    throw error;
  }
  if (request !== openRequest || !card.isConnected) {
    destroy();
    return;
  }

  activeGlance = {
    close: () => api().setOpen(false),
    destroy,
  };
  root.style.visibility = "";
};

const loadFloatingPanelRuntime = (): Promise<FloatingPanelRuntime> => {
  floatingPanelRuntimePromise ??= Promise.all([
    import("@zag-js/floating-panel"),
    import("@zag-js/vanilla"),
  ]).then(([floatingPanelModule, vanillaModule]) => ({
    floatingPanel: floatingPanelModule,
    VanillaMachine: vanillaModule.VanillaMachine,
    normalizeProps: vanillaModule.normalizeProps,
    spreadProps: vanillaModule.spreadProps,
  }));
  return floatingPanelRuntimePromise;
};

const loadMasonryRuntime = (): Promise<MasonryConstructor> => {
  masonryRuntimePromise ??= import("masonry-layout").then((module) => {
    const runtime = module as unknown as { default?: MasonryConstructor };
    return runtime.default ?? (module as unknown as MasonryConstructor);
  });
  return masonryRuntimePromise;
};

const initializeTravelMasonry = async (
  root: HTMLElement,
  cleanups: Array<() => void>,
): Promise<void> => {
  const flow = root.querySelector<HTMLElement>("[data-travel-glance-flow]");
  if (!flow) {
    return;
  }

  let cleaned = false;
  let masonry: MasonryInstance | null = null;
  const layout = (): void => {
    masonry?.reloadItems?.();
    masonry?.layout?.();
  };
  const Masonry = await loadMasonryRuntime();
  if (cleaned || !flow.isConnected) {
    return;
  }
  masonry = new Masonry(flow, {
    columnWidth: ".travel-glance-sizer",
    gutter: 14,
    horizontalOrder: true,
    itemSelector: ".travel-glance-flow-item",
    percentPosition: true,
    transitionDuration: 0,
  });
  flow.dataset.layout = "ready";
  flow.setAttribute("aria-busy", "false");
  layout();

  const mediaCleanups = [...flow.querySelectorAll("iframe,img,video")].map((element) => {
    element.addEventListener("load", layout);
    element.addEventListener("error", layout);
    return (): void => {
      element.removeEventListener("load", layout);
      element.removeEventListener("error", layout);
    };
  });

  cleanups.push(() => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    mediaCleanups.forEach((cleanup) => cleanup());
    masonry?.destroy?.();
    masonry = null;
  });
};

const glanceNodes = (
  root: HTMLElement,
): {
  backdrop: HTMLElement;
  body: HTMLElement;
  close: HTMLButtonElement;
  content: HTMLElement;
  drag: HTMLElement;
  header: HTMLElement;
  maximize: HTMLButtonElement;
  positioner: HTMLElement;
  resizeTriggers: Array<{ axis: ResizeTriggerAxis; element: HTMLElement }>;
  restore: HTMLButtonElement;
  title: HTMLElement;
} | null => {
  const backdrop = root.querySelector<HTMLElement>("[data-travel-glance-backdrop]");
  const body = root.querySelector<HTMLElement>("[data-travel-glance-body]");
  const close = root.querySelector<HTMLButtonElement>("[data-travel-glance-close]");
  const content = root.querySelector<HTMLElement>("[data-travel-glance-content]");
  const drag = root.querySelector<HTMLElement>("[data-travel-glance-drag]");
  const header = root.querySelector<HTMLElement>("[data-travel-glance-header]");
  const maximize = root.querySelector<HTMLButtonElement>('[data-travel-glance-stage="maximized"]');
  const positioner = root.querySelector<HTMLElement>("[data-travel-glance-positioner]");
  const restore = root.querySelector<HTMLButtonElement>('[data-travel-glance-stage="default"]');
  const title = root.querySelector<HTMLElement>("[data-travel-glance-title]");
  const resizeTriggers = resizeAxes.flatMap((axis) => {
    const element = root.querySelector<HTMLElement>(`[data-travel-glance-resize="${axis}"]`);
    return element ? [{ axis, element }] : [];
  });
  return backdrop &&
    body &&
    close &&
    content &&
    drag &&
    header &&
    maximize &&
    positioner &&
    resizeTriggers.length === resizeAxes.length &&
    restore &&
    title
    ? {
        backdrop,
        body,
        close,
        content,
        drag,
        header,
        maximize,
        positioner,
        resizeTriggers,
        restore,
        title,
      }
    : null;
};

const zenPanelRect = (): {
  maxSize: { height: number; width: number };
  minSize: { height: number; width: number };
  position: { x: number; y: number };
  size: { height: number; width: number };
} => {
  const viewport = window.visualViewport;
  const viewportWidth = Math.round(viewport?.width ?? window.innerWidth);
  const viewportHeight = Math.round(viewport?.height ?? window.innerHeight);
  const inset = viewportWidth <= 900 ? 10 : 22;
  const desiredWidth =
    viewportWidth <= 900
      ? viewportWidth - inset * 2
      : Math.min(viewportWidth * 0.8, 1360, viewportWidth - inset * 2);
  const width = Math.max(280, Math.round(desiredWidth));
  const height = Math.max(360, viewportHeight);
  return {
    maxSize: { width: viewportWidth, height },
    minSize: { width: Math.min(420, width), height: Math.min(420, height) },
    position: { x: Math.round((viewportWidth - width) / 2), y: 0 },
    size: { width, height },
  };
};

const toggleTravelMap = (button: HTMLButtonElement): void => {
  const map = mapForButton(button);
  if (!map) {
    return;
  }
  const shouldOpen = map.hasAttribute("hidden");
  map.toggleAttribute("hidden", !shouldOpen);
  button.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen) {
    loadMapFrames(map);
  }
};

const mapForButton = (button: HTMLButtonElement): HTMLElement | null => {
  const controls = button.getAttribute("aria-controls");
  if (controls) {
    return document.getElementById(controls);
  }
  return (
    button
      .closest<HTMLElement>(travelCardSelector)
      ?.querySelector<HTMLElement>("[data-travel-map]") ?? null
  );
};

const loadMapFrames = (root: ParentNode): void => {
  for (const frame of root.querySelectorAll<HTMLIFrameElement>("iframe[data-map-src]")) {
    const src = frame.dataset.mapSrc;
    if (src && frame.getAttribute("src") !== src) {
      frame.src = src;
    }
  }
};

const escapeText = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
