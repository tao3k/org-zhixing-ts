import { blogArticleFromEvent, blogZenModeFromEvent } from "./blogState";
import type { AgendaPanelKey } from "./agendaTypes";
import { isAgendaMode, isAgendaPanel } from "./agendaState";
import type { AppDomNodes } from "./appDom";
import { bindTravelGlance } from "./travelGlance";
import type { AgendaModeKey } from "./config";
import type { ViewKey } from "./model";

export type AppEventHandlers = {
  onAgendaMode: (mode: AgendaModeKey) => void;
  onAgendaPanel: (panel: AgendaPanelKey) => void;
  onAgendaRule: (ruleId: string) => void;
  onBlogArticle: (rangeStart: number) => void;
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

  dom.sourceSelect.addEventListener(
    "change",
    () => handlers.onSourceSelect(dom.sourceSelect.value),
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
  dom.view.addEventListener("click", (event) => handleBlogZen(event, handlers), listenerOptions);
  bindLazyAttachmentGalleryViewer(dom, signal);
  bindTravelGlance(dom, signal);
  bindLazyTravelVirtualList(dom, signal);
  window.addEventListener("beforeunload", () => handlers.onDispose(), listenerOptions);
};

const attachmentImageOpenerSelector = 'a[data-attachment-open][data-attachment-kind="image"]';

const bindLazyAttachmentGalleryViewer = (dom: AppDomNodes, signal: AbortSignal): void => {
  let loading = false;
  const maybeBind = (): void => {
    if (loading || signal.aborted || !dom.view.querySelector(attachmentImageOpenerSelector)) {
      return;
    }
    loading = true;
    void import("./attachmentGalleryViewer").then(({ bindAttachmentGalleryViewer }) => {
      if (!signal.aborted) {
        bindAttachmentGalleryViewer(dom, signal);
      }
      observer.disconnect();
    });
  };
  const observer = new MutationObserver(maybeBind);
  observer.observe(dom.view, { childList: true });
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  maybeBind();
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
  if (rangeStart !== null) {
    handlers.onBlogArticle(rangeStart);
  }
};

const handleBlogZen = (event: Event, handlers: AppEventHandlers): void => {
  const zenMode = blogZenModeFromEvent(event);
  if (zenMode !== null) {
    handlers.onBlogZenMode(zenMode);
  }
};
