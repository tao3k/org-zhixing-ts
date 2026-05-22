import {
  clearBlogCache,
  initialBlogReaderState,
  readerModeFor,
  syncBlogArticleSelection,
  type BlogReaderState,
} from "./blogState";
import {
  publicAssetUrl,
  sourceFromUserPath,
  type AgendaModeKey,
  type SiteConfig,
  type SourceItem,
} from "./config";
import type { AgendaPanelKey } from "./agendaTypes";
import { projectAgendaDocument } from "./appAgendaProjection";
import { loadAppBootState } from "./appBoot";
import { bindAppDom, type AppDomNodes } from "./appDom";
import { bindAppEvents } from "./appEvents";
import { attachmentGalleryFromSources } from "./attachmentGalleryModel";
import {
  configureChrome,
  renderSourceOptionsToDom,
  scrollAgendaRuleIntoView,
  updateActiveTab,
} from "./appUi";
import { createCaptureApplyPreview } from "./captureApplyPreview";
import { createAgentCaptureRequest } from "./captureModel";
import {
  createDocumentView,
  withAgentMemory,
  withAttachmentInventory,
  withCapturePlan,
  withLint,
  type OrgizeDocumentView,
} from "./model";
import { createAgentMemoryView } from "./memoryModel";
import { OrgizeSession, type OrgizeSessionOptions } from "./orgizeClient";
import { renderAppShell } from "./appShell";
import { renderStats, renderView } from "./render";
import {
  documentViewFromStaticSource,
  loadAllStaticSources,
  loadStaticSourceFor,
  type StaticSiteData,
  type StaticSourceProjection,
} from "./staticSiteData";
import { siteNoteSources, type SiteNoteSource } from "./siteNotes";
import { travelViewFromStaticSite } from "./travelSiteProjection";
import { writeAppUrlState } from "./urlState";
import { viewCacheKey } from "./viewCache";
import type { ViewKey } from "./model";
import type { AttachmentGalleryView } from "./attachmentGalleryModel";

export type OrgZhixingAppOptions = Pick<OrgizeSessionOptions, "createWorker">;
export type OrgZhixingAppHandle = { dispose: () => void };

export const mountOrgZhixingApp = (
  app: HTMLElement,
  options: OrgZhixingAppOptions,
): OrgZhixingAppHandle => {
  const runtime = new OrgZhixingApp(app, options);
  runtime.mount();
  return runtime;
};

class OrgZhixingApp implements OrgZhixingAppHandle {
  readonly #root: HTMLElement;
  readonly #session: OrgizeSession;
  #abortController = new AbortController();
  #dom!: AppDomNodes;
  #currentView: ViewKey = "blog";
  #agendaMode: AgendaModeKey = "classic";
  #agendaPanel: AgendaPanelKey = "trace";
  #agendaRuleId: string | null = null;
  #blog: BlogReaderState = initialBlogReaderState();
  #siteConfig: SiteConfig | null = null;
  #staticSite: StaticSiteData | null = null;
  #staticSources: StaticSourceProjection[] | null = null;
  #siteAttachmentGallery: AttachmentGalleryView | null = null;
  #siteNotes: SiteNoteSource[] | null = null;
  #sourceItem: SourceItem | null = null;
  #documentView: OrgizeDocumentView | null = null;
  #renderedHtml = "";
  #pendingMessage = "Loading Org parser...";
  #articleMessage = "Rendering article...";
  #documentVersion = 0;
  #sourceOrg = "";
  #showPerformance = true;
  #timings = {};
  #viewCache = new Map<string, string>();

  constructor(root: HTMLElement, options: OrgZhixingAppOptions) {
    this.#root = root;
    this.#session = new OrgizeSession({ createWorker: options.createWorker });
  }

  dispose(): void {
    this.#abortController.abort();
    this.#session.dispose();
  }

  mount(): void {
    this.#root.innerHTML = renderAppShell();
    this.#dom = bindAppDom(this.#root);
    this.#bindEvents();
    this.#render();
    void this.#boot();
  }

  #bindEvents(): void {
    bindAppEvents(this.#dom, this.#abortController.signal, {
      onView: (view) => {
        this.#currentView = view;
        updateActiveTab(this.#dom, this.#currentView);
        this.#writeUrlState();
        void this.#refreshActiveProjection();
      },
      onSourceSelect: (sourceFile) => {
        if (!this.#siteConfig) {
          return;
        }
        const nextSource = sourceFromUserPath(this.#siteConfig, sourceFile);
        this.#blog.articleRangeStart = null;
        this.#writeUrlState();
        void this.#loadSource(nextSource);
      },
      onSourceFeed: (sourceId) => {
        if (!this.#siteConfig) return;
        const nextSource = sourceFromUserPath(this.#siteConfig, sourceId);
        this.#agendaRuleId = null;
        this.#blog.articleRangeStart = null;
        this.#writeUrlState();
        void this.#loadSource(nextSource);
      },
      onAgendaMode: (mode) => {
        this.#agendaMode = mode;
        this.#agendaRuleId = null;
        this.#clearAgendaCache();
        this.#writeUrlState();
        this.#render();
      },
      onAgendaPanel: (panel) => {
        this.#agendaPanel = panel;
        this.#clearAgendaCache();
        this.#writeUrlState();
        this.#render();
      },
      onAgendaRule: (ruleId) => {
        this.#agendaRuleId = ruleId;
        this.#clearAgendaCache();
        this.#writeUrlState();
        this.#render();
        scrollAgendaRuleIntoView(this.#dom, ruleId);
      },
      onBlogArticle: (rangeStart) => {
        this.#blog.articleRangeStart = rangeStart;
        clearBlogCache(this.#viewCache);
        this.#writeUrlState();
        this.#render();
      },
      onBlogZenMode: (zenMode) => {
        this.#blog.zenMode = zenMode;
        clearBlogCache(this.#viewCache);
        this.#writeUrlState();
        this.#render();
      },
      onDispose: () => this.dispose(),
    });
  }

  async #boot(): Promise<void> {
    try {
      const boot = await loadAppBootState();
      this.#siteConfig = boot.siteConfig;
      this.#staticSite = boot.staticSite;
      this.#siteAttachmentGallery = boot.staticSite?.attachmentGallery ?? null;
      this.#showPerformance = boot.showPerformance;
      this.#currentView = boot.currentView;
      this.#agendaMode = boot.agendaMode;
      this.#agendaPanel = boot.agendaPanel;
      this.#agendaRuleId = boot.agendaRuleId;
      if (this.#staticSite) {
        travelViewFromStaticSite(this.#staticSite);
      }
      configureChrome(this.#dom, this.#siteConfig, this.#currentView, this.#sourceItem);
      await this.#loadSource(boot.initialSource);
      this.#writeUrlState();
    } catch (error) {
      this.#reportError(error);
    }
  }

  async #loadSource(nextSource: SourceItem): Promise<void> {
    const version = ++this.#documentVersion;
    this.#sourceItem = nextSource;
    if (this.#siteConfig) {
      renderSourceOptionsToDom(this.#dom, this.#siteConfig, this.#sourceItem);
    }
    this.#dom.sourceSelect.value = nextSource.file;
    this.#sourceOrg = "";
    this.#documentView = null;
    this.#renderedHtml = "";
    this.#timings = {};
    this.#viewCache.clear();
    this.#pendingMessage = "Loading Org source...";
    this.#articleMessage = "Loading Org source...";
    this.#render();

    const staticSource = await loadStaticSourceFor(this.#staticSite, nextSource);
    if (version !== this.#documentVersion) {
      return;
    }
    if (staticSource && this.#siteConfig) {
      const startedAt = performance.now();
      this.#documentView = documentViewFromStaticSource(staticSource, this.#siteConfig.agenda);
      this.#renderedHtml = staticSource.html;
      syncBlogArticleSelection(this.#documentView, this.#blog);
      this.#pendingMessage = "";
      this.#articleMessage = "";
      this.#timings = { staticMs: performance.now() - startedAt };
      this.#viewCache.clear();
      await this.#refreshCurrentViewDependencies(version);
      if (version !== this.#documentVersion) {
        return;
      }
      this.#updateStatus();
      this.#render();
      return;
    }

    this.#sourceOrg = await this.#loadOrgSource(nextSource.sourceFile);
    this.#pendingMessage = "Parsing view index...";
    this.#articleMessage = "Parsing Org source...";
    this.#render();

    const parsed = await this.#session.parseViewIndex(this.#sourceOrg, nextSource.sourceFile);
    if (version !== this.#documentVersion) {
      return;
    }
    const semanticSections = await this.#session.sectionIndex(nextSource.sourceFile);
    if (version !== this.#documentVersion) {
      return;
    }
    this.#timings = { parseMs: parsed.durationMs };
    this.#documentView = createDocumentView(
      parsed.value.records,
      null,
      semanticSections.value.records,
    );
    syncBlogArticleSelection(this.#documentView, this.#blog);
    this.#pendingMessage = "";
    this.#viewCache.clear();

    if (this.#siteConfig && !this.#siteConfig.behavior.lazyLint) {
      await this.#refreshLintIfNeeded();
    }
    await this.#refreshCurrentViewDependencies(version);
    this.#updateStatus();
    this.#render();
    await this.#refreshArticleHtmlIfNeeded(version);
    this.#updateStatus();
  }

  async #loadOrgSource(sourceFile: string): Promise<string> {
    const response = await fetch(publicAssetUrl(sourceFile), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`failed to load ${sourceFile}: HTTP ${response.status}`);
    }
    return response.text();
  }

  async #refreshActiveProjection(): Promise<void> {
    if (!this.#documentView) {
      this.#render();
      return;
    }
    await this.#refreshCurrentViewDependencies(this.#documentVersion);
    this.#updateStatus();
    this.#render();
  }

  async #refreshCurrentViewDependencies(version: number): Promise<void> {
    if (this.#currentView === "diagnostics") {
      await this.#refreshLintIfNeeded();
    }
    if (this.#currentView === "gallery" && this.#staticSite) {
      await this.#refreshSiteAttachmentGalleryIfNeeded();
      return;
    }
    if (this.#currentView === "records" && this.#staticSite && this.#siteConfig) {
      await this.#refreshSiteNotesIfNeeded();
      return;
    }
    if (this.#currentView === "agenda") {
      await this.#refreshAgendaIfNeeded();
    }
    if (this.#currentView === "memory") {
      await this.#refreshMemoryIfNeeded();
    }
    if (this.#currentView === "blog" || this.#currentView === "gallery") {
      await this.#refreshAttachmentInventoryIfNeeded();
    }
    if (this.#currentView === "records" || this.#currentView === "memory") {
      await this.#refreshAttachmentInventoryIfNeeded();
      await this.#refreshArticleHtmlIfNeeded(version);
    }
    if (this.#currentView === "capture") {
      await this.#refreshCaptureIfNeeded();
    }
  }

  async #refreshLintIfNeeded(): Promise<void> {
    if (this.#documentView?.lint) {
      return;
    }
    const version = this.#documentVersion;
    this.#pendingMessage = "Running lint projection...";
    this.#render();
    const lint = await this.#session.lint();
    if (version !== this.#documentVersion) {
      return;
    }
    this.#timings = { ...this.#timings, lintMs: lint.durationMs };
    if (this.#documentView) {
      this.#documentView = withLint(this.#documentView, lint.value.findings);
    }
    this.#viewCache.delete("diagnostics");
    this.#pendingMessage = "";
  }

  async #refreshAgendaIfNeeded(): Promise<void> {
    if (!this.#documentView || this.#documentView.agendaView || !this.#siteConfig) {
      return;
    }
    const version = this.#documentVersion;
    const documentView = this.#documentView;
    this.#pendingMessage = "Projecting agenda intelligence...";
    this.#render();
    const agenda = await projectAgendaDocument(
      this.#session,
      documentView,
      this.#siteConfig.agenda,
    );
    if (version !== this.#documentVersion) {
      return;
    }
    this.#timings = { ...this.#timings, agendaMs: agenda.durationMs };
    this.#documentView = agenda.document;
    this.#clearAgendaCache();
    this.#pendingMessage = "";
  }

  async #refreshMemoryIfNeeded(): Promise<void> {
    if (this.#documentView?.agentMemory) {
      return;
    }
    const version = this.#documentVersion;
    this.#pendingMessage = "Projecting Agent memory...";
    this.#render();
    const memory = await this.#session.memory();
    if (version !== this.#documentVersion) {
      return;
    }
    this.#timings = { ...this.#timings, memoryMs: memory.durationMs };
    if (this.#documentView) {
      this.#documentView = withAgentMemory(this.#documentView, createAgentMemoryView(memory.value));
    }
    this.#viewCache.delete("memory");
    this.#pendingMessage = "";
  }

  async #refreshAttachmentInventoryIfNeeded(): Promise<void> {
    if (this.#documentView?.attachmentInventory || !this.#siteConfig) {
      return;
    }
    const version = this.#documentVersion;
    this.#pendingMessage = "Projecting attachment gallery...";
    this.#render();
    const attachments = await this.#session.attachmentInventory({
      attachIdDir: this.#siteConfig.attachments.attachIdDir,
      checkVcs: this.#siteConfig.attachments.checkVcs,
      checkAnnex: this.#siteConfig.attachments.checkAnnex,
      scanOrphans: this.#siteConfig.attachments.scanOrphans,
    });
    if (version !== this.#documentVersion) {
      return;
    }
    this.#timings = { ...this.#timings, attachmentMs: attachments.durationMs };
    if (this.#documentView) {
      this.#documentView = withAttachmentInventory(this.#documentView, attachments.value);
    }
    this.#viewCache.delete("gallery");
    this.#viewCache.delete("records");
    this.#viewCache.delete("memory");
    clearBlogCache(this.#viewCache);
    this.#pendingMessage = "";
  }

  async #refreshSiteAttachmentGalleryIfNeeded(): Promise<void> {
    if (this.#siteAttachmentGallery || !this.#staticSite) {
      return;
    }
    this.#pendingMessage = "Loading static attachment gallery...";
    this.#render();
    const sources = await this.#loadAllStaticSources();
    this.#siteAttachmentGallery = attachmentGalleryFromSources(sources);
    this.#viewCache.clear();
    this.#pendingMessage = "";
  }

  async #refreshSiteNotesIfNeeded(): Promise<void> {
    if (this.#siteNotes || !this.#staticSite || !this.#siteConfig) {
      return;
    }
    this.#pendingMessage = "Loading static notes...";
    this.#render();
    const sources = await this.#loadAllStaticSources();
    this.#siteNotes = siteNoteSources(sources, this.#siteConfig.agenda);
    this.#viewCache.clear();
    this.#pendingMessage = "";
  }

  async #loadAllStaticSources(): Promise<StaticSourceProjection[]> {
    if (this.#staticSources) {
      return this.#staticSources;
    }
    this.#staticSources = await loadAllStaticSources(this.#staticSite);
    return this.#staticSources;
  }

  async #refreshCaptureIfNeeded(): Promise<void> {
    if (this.#documentView?.capturePlan || !this.#documentView || !this.#sourceItem) {
      return;
    }
    const version = this.#documentVersion;
    const request = createAgentCaptureRequest(this.#documentView, this.#sourceItem);
    this.#pendingMessage = "Projecting Agent capture plan...";
    this.#render();
    const capture = await this.#session.capturePlan(request);
    if (version !== this.#documentVersion) {
      return;
    }
    this.#timings = { ...this.#timings, captureMs: capture.durationMs };
    if (this.#documentView) {
      this.#documentView = withCapturePlan(
        this.#documentView,
        capture.value,
        request,
        createCaptureApplyPreview(capture.value, this.#sourceItem, this.#sourceOrg),
      );
    }
    this.#viewCache.delete("capture");
    this.#pendingMessage = "";
  }

  async #refreshArticleHtmlIfNeeded(version: number): Promise<void> {
    if (this.#renderedHtml) {
      return;
    }
    this.#articleMessage = "Rendering article...";
    const html = await this.#session.renderTimed("html");
    if (version !== this.#documentVersion) {
      return;
    }
    this.#timings = { ...this.#timings, htmlMs: html.durationMs };
    this.#renderedHtml = html.value;
    this.#articleMessage = "";
    this.#viewCache.delete("records");
    this.#viewCache.delete("memory");
    clearBlogCache(this.#viewCache);
    if (
      this.#currentView === "blog" ||
      this.#currentView === "records" ||
      this.#currentView === "memory"
    ) {
      this.#render();
    }
  }

  #render(): void {
    this.#root.dataset.view = this.#currentView;
    this.#root.dataset.readerMode = readerModeFor(this.#currentView, this.#blog);
    const cacheKey = viewCacheKey({
      agendaMode: this.#agendaMode,
      agendaPanel: this.#agendaPanel,
      agendaRuleId: this.#agendaRuleId,
      blog: this.#blog,
      document: this.#documentView,
      renderedHtml: this.#renderedHtml,
      sourceItem:
        this.#staticSite &&
        (this.#currentView === "gallery" ||
          this.#currentView === "records" ||
          this.#currentView === "travel")
          ? null
          : this.#sourceItem,
      view: this.#currentView,
    });
    let html = this.#viewCache.get(cacheKey);
    if (!html) {
      html = renderView({
        view: this.#currentView,
        document: this.#documentView,
        articleHtml: this.#renderedHtml,
        articleMessage: this.#articleMessage,
        attachmentGallery:
          this.#currentView === "gallery" && this.#staticSite
            ? this.#siteAttachmentGallery
            : undefined,
        blogArticleRangeStart: this.#blog.articleRangeStart,
        blogZenMode: this.#blog.zenMode,
        siteNotes:
          this.#currentView === "records" && this.#staticSite && this.#siteConfig
            ? this.#siteNotes
            : undefined,
        travelView:
          this.#currentView === "travel" && this.#staticSite && this.#siteConfig
            ? travelViewFromStaticSite(this.#staticSite)
            : undefined,
        sourceFile: this.#sourceItem?.sourceFile,
        pendingMessage: this.#pendingMessage,
        agendaMode: this.#agendaMode,
        agendaPanel: this.#agendaPanel,
        agendaRuleId: this.#agendaRuleId,
      });
      this.#viewCache.set(cacheKey, html);
    }
    this.#dom.view.innerHTML = html;
  }

  #clearAgendaCache(): void {
    for (const key of this.#viewCache.keys()) {
      if (key === "agenda" || key.startsWith("agenda:")) {
        this.#viewCache.delete(key);
      }
    }
  }

  #updateStatus(): void {
    this.#dom.status.value = renderStats(
      this.#documentView,
      this.#timings,
      this.#showPerformance,
      this.#currentView === "gallery" && this.#staticSite
        ? (this.#siteAttachmentGallery ?? undefined)
        : undefined,
    );
  }

  #writeUrlState(source: string | null = null): void {
    writeAppUrlState({
      source,
      view: this.#currentView,
      agendaMode: this.#agendaMode,
      agendaPanel: this.#agendaPanel,
      agendaRuleId: this.#agendaRuleId,
      blog: this.#blog,
    });
  }

  #reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.#dom.status.value = "WASM worker failed";
    this.#dom.view.innerHTML = `<div class="error">${message}</div>`;
  }
}
