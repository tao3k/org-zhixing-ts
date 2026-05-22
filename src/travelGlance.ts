import type { AppDomNodes } from "./appDom";

const travelCardSelector = "[data-travel-card]";
const travelTemplateSelector = "template[data-travel-glance-template]";
const interactiveSelector = "a, button, iframe, input, select, textarea, [role='button']";

type DialogModule = typeof import("@zag-js/dialog");
type VanillaModule = typeof import("@zag-js/vanilla");

type DialogRuntime = {
  dialog: DialogModule;
  VanillaMachine: VanillaModule["VanillaMachine"];
  normalizeProps: VanillaModule["normalizeProps"];
  spreadProps: VanillaModule["spreadProps"];
};

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
let dialogRuntimePromise: Promise<DialogRuntime> | null = null;
let masonryRuntimePromise: Promise<MasonryConstructor> | null = null;

export const bindTravelGlance = (dom: AppDomNodes, signal: AbortSignal): void => {
  dom.view.addEventListener("click", handleTravelClick, { signal });
  dom.view.addEventListener("keydown", handleTravelCardKeydown, { signal });
  signal.addEventListener("abort", () => activeGlance?.destroy(), { once: true });
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
  const runtime = await loadDialogRuntime();
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
          <header class="travel-glance-toolbar">
            <div>
              <span>Zen Glance</span>
              <strong data-travel-glance-title>${escapeText(card.dataset.travelTitle ?? "Travel preview")}</strong>
            </div>
            <button type="button" data-travel-glance-close>Close</button>
          </header>
          <div class="travel-glance-body" data-travel-glance-body></div>
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

  const machine = new runtime.VanillaMachine(runtime.dialog.machine, {
    id: "travel-glance",
    modal: true,
    trapFocus: true,
    preventScroll: true,
    restoreFocus: true,
    closeOnEscape: true,
    closeOnInteractOutside: true,
    finalFocusEl: () => card,
    "aria-label": `Zen Glance ${card.dataset.travelTitle ?? "travel place"}`,
    onOpenChange({ open }) {
      if (!open) {
        queueMicrotask(destroy);
      }
    },
  });
  stopMachine = () => machine.stop();

  const syncDialogProps = (): void => {
    propCleanups.splice(0).forEach((cleanup) => cleanup());
    const api = runtime.dialog.connect(machine.service, runtime.normalizeProps);
    propCleanups.push(
      runtime.spreadProps(nodes.backdrop, api.getBackdropProps()),
      runtime.spreadProps(nodes.positioner, api.getPositionerProps()),
      runtime.spreadProps(nodes.content, api.getContentProps()),
      runtime.spreadProps(nodes.title, api.getTitleProps()),
      runtime.spreadProps(nodes.close, api.getCloseTriggerProps()),
    );
  };

  machine.start();
  unsubscribe = machine.subscribe(syncDialogProps);
  syncDialogProps();

  activeGlance = {
    close: () => runtime.dialog.connect(machine.service, runtime.normalizeProps).setOpen(false),
    destroy,
  };
  runtime.dialog.connect(machine.service, runtime.normalizeProps).setOpen(true);
  root.style.visibility = "";
};

const loadDialogRuntime = (): Promise<DialogRuntime> => {
  dialogRuntimePromise ??= Promise.all([import("@zag-js/dialog"), import("@zag-js/vanilla")]).then(
    ([dialogModule, vanillaModule]) => ({
      dialog: dialogModule,
      VanillaMachine: vanillaModule.VanillaMachine,
      normalizeProps: vanillaModule.normalizeProps,
      spreadProps: vanillaModule.spreadProps,
    }),
  );
  return dialogRuntimePromise;
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
  positioner: HTMLElement;
  title: HTMLElement;
} | null => {
  const backdrop = root.querySelector<HTMLElement>("[data-travel-glance-backdrop]");
  const body = root.querySelector<HTMLElement>("[data-travel-glance-body]");
  const close = root.querySelector<HTMLButtonElement>("[data-travel-glance-close]");
  const content = root.querySelector<HTMLElement>("[data-travel-glance-content]");
  const positioner = root.querySelector<HTMLElement>("[data-travel-glance-positioner]");
  const title = root.querySelector<HTMLElement>("[data-travel-glance-title]");
  return backdrop && body && close && content && positioner && title
    ? { backdrop, body, close, content, positioner, title }
    : null;
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
