import {
  blogArticleFromEvent,
  blogKeyboardActionFromEvent,
  blogTagFilterFromEvent,
  blogTimeFilterFromEvent,
  blogZenModeFromEvent,
  type BlogArticleSelection,
  type BlogKeyboardAction,
} from "./blogState";
import type { AgendaPanelKey } from "./agendaTypes";
import { isAgendaMode, isAgendaPanel } from "./agendaState";
import type { AppDomNodes } from "./appDom";
import { bindTravelGlance, prefetchTravelGlanceRuntime } from "./travelGlance";
import { sourcePickerChangeEvent, type SourcePickerChangeDetail } from "./sourcePicker";
import type { AgendaModeKey } from "./config";
import type { ViewKey } from "./model";

export type AppEventHandlers = {
  onAgendaMode: (mode: AgendaModeKey) => void;
  onAgendaPanel: (panel: AgendaPanelKey) => void;
  onAgendaRule: (ruleId: string) => void;
  onBlogArticle: (selection: BlogArticleSelection) => void;
  onBlogKeyboard: (action: BlogKeyboardAction) => boolean;
  onBlogTagFilter: (tag: string | null) => void;
  onBlogTimeFilter: (time: string | null) => void;
  onBlogZenMode: (zenMode: boolean) => void;
  onDispose: () => void;
  onSourceFeed: (sourceId: string) => void;
  onSourceSelect: (sourceFile: string) => void;
  onView: (view: ViewKey) => void;
};

export const bindAppEvents = (
  dom: AppDomNodes,
  signal: AbortSignal,
  handlers: AppEventHandlers,
): void => {
  const listenerOptions = { signal };
  dom.tabs.addEventListener(
    "click",
    (event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-view]");
      if (target?.dataset.view) {
        handlers.onView(target.dataset.view as ViewKey);
      }
    },
    listenerOptions,
  );

  dom.sourcePicker.addEventListener(
    sourcePickerChangeEvent,
    (event) => {
      const detail = (event as CustomEvent<SourcePickerChangeDetail>).detail;
      handlers.onSourceSelect(detail.sourceFile);
    },
    listenerOptions,
  );

  dom.sourceFeed.addEventListener(
    "click",
    (event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "button[data-source-id]",
      );
      if (target?.dataset.sourceId) {
        handlers.onSourceFeed(target.dataset.sourceId);
      }
    },
    listenerOptions,
  );

  dom.view.addEventListener("click", (event) => handleAgendaMode(event, handlers), listenerOptions);
  dom.view.addEventListener(
    "click",
    (event) => handleAgendaPanel(event, handlers),
    listenerOptions,
  );
  dom.view.addEventListener("click", (event) => handleAgendaRule(event, handlers), listenerOptions);
  dom.view.addEventListener(
    "click",
    (event) => handleBlogArticle(event, handlers),
    listenerOptions,
  );
  dom.view.addEventListener("click", (event) => handleBlogTag(event, handlers), listenerOptions);
  dom.view.addEventListener("click", (event) => handleBlogTime(event, handlers), listenerOptions);
  dom.view.addEventListener("click", (event) => handleBlogZen(event, handlers), listenerOptions);
  window.addEventListener(
    "keydown",
    (event) => handleBlogKeyboard(event, handlers),
    listenerOptions,
  );
  bindLazyAttachmentGalleryViewer(dom, signal);
  bindTravelGlance(dom, signal);
  bindTravelGlancePrefetch(dom, signal);
  bindLazyTravelVirtualList(dom, signal);
  bindLazyBlogVirtualList(dom, signal);
  bindLazyBlogZenProgress(dom, signal);
  window.addEventListener("beforeunload", () => handlers.onDispose(), listenerOptions);
};

const attachmentImageOpenerSelector = 'a[data-attachment-open][data-attachment-kind="image"]';

const bindLazyAttachmentGalleryViewer = (dom: AppDomNodes, signal: AbortSignal): void => {
  let bound = false;
  let scheduled = false;
  let loading: Promise<void> | null = null;
  const load = (): Promise<void> => {
    loading ??= import("./attachmentGalleryViewer").then(({ bindAttachmentGalleryViewer }) => {
      if (!signal.aborted && !bound) {
        bound = true;
        bindAttachmentGalleryViewer(dom, signal);
      }
      observer.disconnect();
    });
    return loading;
  };
  const maybeBind = (): void => {
    if (
      bound ||
      loading ||
      scheduled ||
      signal.aborted ||
      !dom.view.querySelector(attachmentImageOpenerSelector)
    ) {
      return;
    }
    scheduled = true;
    scheduleIdleImport(load, signal);
  };
  dom.view.addEventListener(
    "pointerover",
    (event) => {
      if ((event.target as HTMLElement).closest(attachmentImageOpenerSelector)) {
        void load();
      }
    },
    { capture: true, signal },
  );
  dom.view.addEventListener(
    "click",
    (event) => {
      const opener = (event.target as HTMLElement).closest<HTMLAnchorElement>(
        attachmentImageOpenerSelector,
      );
      if (!opener || bound) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      void load().then(() => {
        if (!signal.aborted && opener.isConnected) {
          opener.click();
        }
      });
    },
    { capture: true, signal },
  );
  const observer = new MutationObserver(maybeBind);
  observer.observe(dom.view, { childList: true });
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  maybeBind();
};

const bindTravelGlancePrefetch = (dom: AppDomNodes, signal: AbortSignal): void => {
  let scheduled = false;
  const maybePrefetch = (): void => {
    if (scheduled || signal.aborted || !dom.view.querySelector("[data-travel-card]")) {
      return;
    }
    scheduled = true;
    scheduleIdleImport(() => {
      prefetchTravelGlanceRuntime();
      return Promise.resolve();
    }, signal);
    observer.disconnect();
  };
  const observer = new MutationObserver(maybePrefetch);
  observer.observe(dom.view, { childList: true });
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  maybePrefetch();
};

const bindLazyTravelVirtualList = (dom: AppDomNodes, signal: AbortSignal): void => {
  let loading = false;
  const maybeBind = (): void => {
    if (loading || signal.aborted || !dom.view.querySelector("[data-travel-virtual-list]")) {
      return;
    }
    loading = true;
    void import("./travelVirtualList").then(({ bindTravelVirtualList }) => {
      if (!signal.aborted) {
        bindTravelVirtualList(dom, signal);
      }
      observer.disconnect();
    });
  };
  const observer = new MutationObserver(maybeBind);
  observer.observe(dom.view, { childList: true });
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  maybeBind();
};

const bindLazyBlogVirtualList = (dom: AppDomNodes, signal: AbortSignal): void => {
  let loading = false;
  const maybeBind = (): void => {
    if (loading || signal.aborted || !dom.view.querySelector("[data-blog-virtual-list]")) {
      return;
    }
    loading = true;
    void import("./blogVirtualList").then(({ bindBlogVirtualList }) => {
      if (!signal.aborted) {
        bindBlogVirtualList(dom, signal);
      }
      observer.disconnect();
    });
  };
  const observer = new MutationObserver(maybeBind);
  observer.observe(dom.view, { childList: true });
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  maybeBind();
};

const bindLazyBlogZenProgress = (dom: AppDomNodes, signal: AbortSignal): void => {
  let loading = false;
  const maybeBind = (): void => {
    if (loading || signal.aborted || !dom.view.querySelector("[data-blog-zen-progress]")) {
      return;
    }
    loading = true;
    void import("./blogZenProgress").then(({ bindBlogZenProgress }) => {
      if (!signal.aborted) {
        bindBlogZenProgress(dom, signal);
      }
      observer.disconnect();
    });
  };
  const observer = new MutationObserver(maybeBind);
  observer.observe(dom.view, { childList: true });
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  maybeBind();
};

const scheduleIdleImport = (load: () => Promise<void>, signal: AbortSignal): void => {
  const timeout = window.setTimeout(() => {
    if (!signal.aborted) {
      void load();
    }
  }, 450);
  signal.addEventListener("abort", () => window.clearTimeout(timeout), { once: true });
};

const handleAgendaMode = (event: Event, handlers: AppEventHandlers): void => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-agenda-mode]",
  );
  const mode = target?.dataset.agendaMode;
  if (isAgendaMode(mode)) {
    handlers.onAgendaMode(mode);
  }
};

const handleAgendaPanel = (event: Event, handlers: AppEventHandlers): void => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-agenda-panel]",
  );
  const panel = target?.dataset.agendaPanel;
  if (isAgendaPanel(panel)) {
    handlers.onAgendaPanel(panel);
  }
};

const handleAgendaRule = (event: Event, handlers: AppEventHandlers): void => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-agenda-rule-select]");
  if (target?.dataset.agendaRuleSelect) {
    handlers.onAgendaRule(target.dataset.agendaRuleSelect);
  }
};

const handleBlogArticle = (event: Event, handlers: AppEventHandlers): void => {
  const rangeStart = blogArticleFromEvent(event);
  if (rangeStart) {
    handlers.onBlogArticle(rangeStart);
  }
};

const handleBlogTag = (event: Event, handlers: AppEventHandlers): void => {
  const tag = blogTagFilterFromEvent(event);
  if (tag !== undefined) {
    handlers.onBlogTagFilter(tag);
  }
};

const handleBlogTime = (event: Event, handlers: AppEventHandlers): void => {
  const time = blogTimeFilterFromEvent(event);
  if (time !== undefined) {
    handlers.onBlogTimeFilter(time);
  }
};

const handleBlogZen = (event: Event, handlers: AppEventHandlers): void => {
  const zenMode = blogZenModeFromEvent(event);
  if (zenMode !== null) {
    handlers.onBlogZenMode(zenMode);
  }
};

const handleBlogKeyboard = (event: KeyboardEvent, handlers: AppEventHandlers): void => {
  const action = blogKeyboardActionFromEvent(event);
  if (action && handlers.onBlogKeyboard(action)) {
    event.preventDefault();
  }
};
