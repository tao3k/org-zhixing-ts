import * as Effect from "effect/Effect";
import type {
  OrgizeAttachmentInventoryResponseDto,
  OrgizeMemoryResponseDto,
  OrgizeSectionIndexResponseDto,
} from "orgize/dto";
import {
  loadSiteConfig,
  resolveInitialSource,
  showPerformanceFromUrl,
  sourceFromUserPath,
  type SiteConfig,
  type SourceItem,
} from "../config";
import {
  documentViewFromStaticSource,
  loadAllStaticSources,
  loadStaticAgendaForSource,
  loadStaticAttachmentInventoryForSource,
  loadStaticMemoryForSource,
  loadStaticSectionIndexForSource,
  loadStaticSiteData,
  loadStaticSourceFor,
  withStaticSiteSources,
  type StaticBlogArticle,
  type StaticSiteData,
  type StaticSourceProjection,
} from "../staticSiteData";
import { siteNoteSources, type SiteNoteSource } from "../siteNotes";
import type { OrgizeDocumentView } from "../model";

export type ContentShellData = {
  initialSource: SourceItem;
  showPerformance: boolean;
  siteConfig: SiteConfig;
  staticSite: StaticSiteData | null;
};

export type StaticArticleData = {
  article: StaticBlogArticle;
  attachmentInventory: OrgizeAttachmentInventoryResponseDto | null;
  document: OrgizeDocumentView;
  html: string;
  sectionIndex: OrgizeSectionIndexResponseDto | null;
  source: SourceItem;
  staticSource: StaticSourceProjection;
};

export type StaticDocumentData = {
  attachmentInventory: OrgizeAttachmentInventoryResponseDto | null;
  document: OrgizeDocumentView;
  html: string;
  memory: OrgizeMemoryResponseDto | null;
  sectionIndex: OrgizeSectionIndexResponseDto | null;
  source: SourceItem;
  staticSource: StaticSourceProjection;
};

export type StaticDocumentOptions = {
  agenda?: boolean;
  attachmentInventory?: boolean;
  memory?: boolean;
  sectionIndex?: boolean;
  sourceFile?: string | null;
};

class StaticContentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StaticContentError";
  }
}

export const loadContentShellData = (): Promise<ContentShellData> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const staticSite = yield* promiseEffect("static manifest", () => loadStaticSiteData());
      const config = withStaticSiteSources(
        yield* promiseEffect("site config", () => loadSiteConfig()),
        staticSite,
      );
      return {
        initialSource: resolveInitialSource(config),
        showPerformance: showPerformanceFromUrl(config.behavior.showPerformance),
        siteConfig: config,
        staticSite,
      };
    }),
  );

export const loadBlogArticleData = (
  articleId: string,
  shell: ContentShellData,
): Promise<StaticArticleData> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const rangeStart = Number(articleId);
      if (!Number.isSafeInteger(rangeStart)) {
        return yield* Effect.fail(new StaticContentError(`invalid article id: ${articleId}`));
      }
      const article = shell.staticSite?.blog?.articles.find(
        (candidate) => candidate.rangeStart === rangeStart,
      );
      if (!article) {
        return yield* Effect.fail(new StaticContentError(`article not found: ${articleId}`));
      }
      const documentData = yield* staticDocumentEffect(shell, {
        attachmentInventory: true,
        sectionIndex: true,
        sourceFile: article.sourceFile,
      });
      return {
        article,
        attachmentInventory: documentData.attachmentInventory,
        document: documentData.document,
        html: documentData.html,
        sectionIndex: documentData.sectionIndex,
        source: documentData.source,
        staticSource: documentData.staticSource,
      };
    }),
  );

export const loadStaticDocumentData = (
  shell: ContentShellData,
  options: StaticDocumentOptions = {},
): Promise<StaticDocumentData> => Effect.runPromise(staticDocumentEffect(shell, options));

export const loadSiteNotesData = (shell: ContentShellData): Promise<SiteNoteSource[]> =>
  Effect.runPromise(
    promiseEffect("site notes", async () => {
      const sources = await loadAllStaticSources(shell.staticSite, {
        attachmentInventory: true,
        sectionIndex: true,
      });
      return siteNoteSources(sources, shell.siteConfig.agenda);
    }),
  );

const staticDocumentEffect = (
  shell: ContentShellData,
  options: StaticDocumentOptions,
): Effect.Effect<StaticDocumentData, StaticContentError> =>
  Effect.gen(function* () {
    const source = options.sourceFile
      ? sourceFromUserPath(shell.siteConfig, options.sourceFile)
      : shell.initialSource;
    const staticSource = yield* promiseEffect("source shard", () =>
      loadStaticSourceFor(shell.staticSite, source),
    );
    if (!staticSource) {
      return yield* Effect.fail(
        new StaticContentError(`static source not found: ${source.sourceFile}`),
      );
    }
    const [sectionIndex, attachmentInventory, memory, agenda] = yield* promiseEffect(
      "source projection shards",
      () =>
        Promise.all([
          options.sectionIndex
            ? loadStaticSectionIndexForSource(shell.staticSite, staticSource)
            : Promise.resolve(null),
          options.attachmentInventory
            ? loadStaticAttachmentInventoryForSource(shell.staticSite, staticSource)
            : Promise.resolve(null),
          options.memory
            ? loadStaticMemoryForSource(shell.staticSite, staticSource)
            : Promise.resolve(null),
          options.agenda
            ? loadStaticAgendaForSource(shell.staticSite, staticSource)
            : Promise.resolve(null),
        ]),
    );
    return {
      attachmentInventory,
      document: documentViewFromStaticSource(staticSource, {
        agenda: shell.siteConfig.agenda,
        agendaRange: agenda?.agendaRange,
        agendaView: agenda?.agendaView,
        attachmentInventory,
        memory,
        sectionIndex,
      }),
      html: staticSource.html,
      memory,
      sectionIndex,
      source,
      staticSource,
    };
  });

const promiseEffect = <Value>(
  label: string,
  promise: () => Promise<Value>,
): Effect.Effect<Value, StaticContentError> =>
  Effect.tryPromise({
    try: promise,
    catch: (cause) => new StaticContentError(`failed to load ${label}`, { cause }),
  });
