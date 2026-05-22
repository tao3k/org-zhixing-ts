import {
  Virtualizer,
  elementScroll,
  measureElement,
  observeElementOffset,
  observeElementRect,
  type Rect,
  type VirtualizerOptions,
} from "@tanstack/virtual-core";
import type { AppDomNodes } from "./appDom";

const virtualListSelector = "[data-travel-virtual-list]";
const travelCardSelector = ":scope > [data-travel-card]";
const virtualListThreshold = 80;
const rowGap = 8;

type VirtualListInstance = {
  cleanup: () => void;
  element: HTMLElement;
};

export const bindTravelVirtualList = (dom: AppDomNodes, signal: AbortSignal): void => {
  const instances = new Set<VirtualListInstance>();

  const cleanupDisconnected = (): void => {
    for (const instance of instances) {
      if (!instance.element.isConnected) {
        instance.cleanup();
        instances.delete(instance);
      }
    }
  };

  const enhance = (): void => {
    cleanupDisconnected();
    for (const list of dom.view.querySelectorAll<HTMLElement>(virtualListSelector)) {
      if (list.dataset.travelVirtualized) {
        continue;
      }
      const instance = virtualizeTravelList(list);
      if (instance) {
        instances.add(instance);
      }
    }
  };

  const observer = new MutationObserver(enhance);
  observer.observe(dom.view, { childList: true });
  signal.addEventListener(
    "abort",
    () => {
      observer.disconnect();
      for (const instance of instances) {
        instance.cleanup();
      }
      instances.clear();
    },
    { once: true },
  );
  enhance();
};

const virtualizeTravelList = (list: HTMLElement): VirtualListInstance | null => {
  const cardHtml = [...list.querySelectorAll<HTMLElement>(travelCardSelector)].map(
    (card) => card.outerHTML,
  );
  if (cardHtml.length < virtualListThreshold) {
    list.dataset.travelVirtualized = "skipped";
    return null;
  }

  list.dataset.travelVirtualized = "true";
  list.classList.add("travel-card-grid--virtual");
  const spacer = document.createElement("div");
  spacer.className = "travel-virtual-spacer";
  list.replaceChildren(spacer);

  let virtualizer: Virtualizer<HTMLElement, HTMLElement>;
  const render = (): void => {
    const virtualItems = virtualizer.getVirtualItems();
    spacer.style.height = `${virtualizer.getTotalSize()}px`;
    spacer.replaceChildren(
      ...virtualItems.map((item) => {
        const row = document.createElement("div");
        row.className = "travel-virtual-row";
        row.dataset.index = String(item.index);
        row.style.transform = `translateY(${item.start}px)`;
        row.innerHTML = cardHtml[item.index] ?? "";
        return row;
      }),
    );
    for (const row of spacer.querySelectorAll<HTMLElement>(".travel-virtual-row")) {
      virtualizer.measureElement(row);
    }
  };

  virtualizer = new Virtualizer<HTMLElement, HTMLElement>({
    count: cardHtml.length,
    getScrollElement: () => list,
    estimateSize: (index) => estimateRowSize(cardHtml[index] ?? ""),
    getItemKey: (index) => index,
    gap: rowGap,
    initialRect: {
      height: list.clientHeight || 640,
      width: list.clientWidth || 960,
    },
    overscan: 5,
    observeElementRect: observeTravelElementRect,
    observeElementOffset: observeTravelElementOffset,
    scrollToFn: elementScroll,
    measureElement,
    onChange: render,
  });

  const cleanupVirtualizer = virtualizer._didMount();
  virtualizer._willUpdate();
  render();

  return {
    element: list,
    cleanup: cleanupVirtualizer,
  };
};

const estimateRowSize = (html: string): number => {
  const longTitleCost = Math.min(48, Math.floor(html.length / 220));
  return 110 + longTitleCost;
};

const observeTravelElementRect: VirtualizerOptions<
  HTMLElement,
  HTMLElement
>["observeElementRect"] = (instance, callback) => {
  const emitRect = (rect?: Rect): void => {
    const element = instance.scrollElement;
    callback({
      height: rect?.height || element?.clientHeight || 640,
      width: rect?.width || element?.clientWidth || 960,
    });
  };
  emitRect();
  return observeElementRect(instance, emitRect);
};

const observeTravelElementOffset: VirtualizerOptions<
  HTMLElement,
  HTMLElement
>["observeElementOffset"] = (instance, callback) => {
  callback(instance.scrollElement?.scrollTop ?? 0, false);
  return observeElementOffset(instance, callback);
};
