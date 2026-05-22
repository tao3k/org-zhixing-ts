import type {
  OrgizeAgendaViewResponseDto,
  OrgizeAttachmentInventoryResponseDto,
  OrgizeLintResponseDto,
  OrgizeMemoryResponseDto,
  OrgizeSectionIndexResponseDto,
  OrgizeViewIndexResponseDto,
} from "orgize/dto";
import type { AgendaSettings, SiteConfig, SourceItem } from "./config";
import { publicAssetUrl } from "./config";
import { createAgentMemoryView } from "./memoryModel";
import {
  createDocumentView,
  withAgendaView,
  withAgentMemory,
  withAttachmentInventory,
  type BlogArticleRecord,
  type OrgizeDocumentView,
} from "./model";
import type { AttachmentGalleryView } from "./attachmentGalleryModel";
import type { TravelView } from "./travelModel";

export type StaticSourceSummary = {
  id: string;
  name: string;
  orgTitle?: string;
  file: string;
  sourceFile: string;
  sourceBytes: number;
  shardPath?: string;
  memoryShardPath?: string;
  sectionShardPath?: string;
};

export type StaticSourceProjection = {
  id: string;
  name: string;
  orgTitle?: string;
  file: string;
  sourceFile: string;
  sourceBytes: number;
  agendaRange?: AgendaSettings;
  viewIndex: OrgizeViewIndexResponseDto;
  sectionIndex?: OrgizeSectionIndexResponseDto;
  sectionShardPath?: string;
  html: string;
  attachmentInventory: OrgizeAttachmentInventoryResponseDto;
  memory?: OrgizeMemoryResponseDto;
  memoryShardPath?: string;
  agendaView: OrgizeAgendaViewResponseDto;
  lint: OrgizeLintResponseDto;
};

export type StaticMemoryShard = {
  schemaVersion: 1;
  sourceId: string;
  sourceFile: string;
  memory: OrgizeMemoryResponseDto;
};

export type StaticSectionShard = {
  schemaVersion: 1;
  sourceId: string;
  sourceFile: string;
  sectionIndex: OrgizeSectionIndexResponseDto;
};

export type StaticBlogArticle = BlogArticleRecord & {
  file: string;
  sourceFile: string;
  sourceId: string;
  sourceName: string;
};

export type StaticBlogIndex = {
  articleCount: number;
  articles: StaticBlogArticle[];
  dateRange: { end: string; start: string } | null;
  siteWide: true;
  sourceCount: number;
  tagFacets: Array<{ count: number; tag: string }>;
};

export type StaticSiteData = {
  schemaVersion: 1;
  generatedAt: string;
  configPath: string;
  orgize: {
    buildTime: string;
    gitHash: string;
  };
  attachmentGallery?: AttachmentGalleryView;
  blog?: StaticBlogIndex;
  travel?: TravelView;
  sources: StaticSource[];
};

export type StaticSource = StaticSourceProjection | StaticSourceSummary;

const sourceCache = new WeakMap<
  StaticSiteData,
  Map<string, Promise<StaticSourceProjection | null>>
>();
const memoryCache = new WeakMap<
  StaticSiteData,
  Map<string, Promise<OrgizeMemoryResponseDto | null>>
>();
const sectionCache = new WeakMap<
  StaticSiteData,
  Map<string, Promise<OrgizeSectionIndexResponseDto | null>>
>();

export const loadStaticSiteData = async (): Promise<StaticSiteData | null> => {
  try {
    const response = await fetch(publicAssetUrl("org-zhixing.static.json"));
    if (!response.ok) {
      return null;
    }
    const value = (await response.json()) as Partial<StaticSiteData>;
    if (value.schemaVersion !== 1 || !Array.isArray(value.sources)) {
      return null;
    }
    return value as StaticSiteData;
  } catch {
    return null;
  }
};

export const loadStaticSourceFor = async (
  staticSite: StaticSiteData | null,
  source: SourceItem,
): Promise<StaticSourceProjection | null> => {
  if (!staticSite) {
    return null;
  }
  const matched = findStaticSource(staticSite, source) ?? null;
  return matched ? loadStaticSource(staticSite, matched) : null;
};

export const loadStaticMemoryForSource = async (
  staticSite: StaticSiteData | null,
  source: SourceItem | StaticSource,
): Promise<OrgizeMemoryResponseDto | null> => {
  if (!staticSite) {
    return null;
  }
  if (isStaticSourceProjection(source) && source.memory) {
    return source.memory;
  }
  const matched = findStaticSource(staticSite, source);
  if (matched && isStaticSourceProjection(matched) && matched.memory) {
    return matched.memory;
  }
  const shardPath =
    matched?.memoryShardPath ?? ("memoryShardPath" in source ? source.memoryShardPath : undefined);
  if (!shardPath) {
    return null;
  }
  const cache = memoryCacheFor(staticSite);
  const key = matched?.sourceFile ?? source.sourceFile;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const loaded = fetchStaticMemoryShard(shardPath);
  cache.set(key, loaded);
  return loaded;
};

export const loadStaticSectionIndexForSource = async (
  staticSite: StaticSiteData | null,
  source: SourceItem | StaticSource,
): Promise<OrgizeSectionIndexResponseDto | null> => {
  if (!staticSite) {
    return null;
  }
  if (isStaticSourceProjection(source) && source.sectionIndex) {
    return source.sectionIndex;
  }
  const matched = findStaticSource(staticSite, source);
  if (matched && isStaticSourceProjection(matched) && matched.sectionIndex) {
    return matched.sectionIndex;
  }
  const shardPath =
    matched?.sectionShardPath ??
    ("sectionShardPath" in source ? source.sectionShardPath : undefined);
  if (!shardPath) {
    return null;
  }
  const cache = sectionCacheFor(staticSite);
  const key = matched?.sourceFile ?? source.sourceFile;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const loaded = fetchStaticSectionShard(shardPath);
  cache.set(key, loaded);
  return loaded;
};

export const loadAllStaticSources = async (
  staticSite: StaticSiteData | null,
  options: { sectionIndex?: boolean } = {},
): Promise<StaticSourceProjection[]> =>
  staticSite
    ? (
        await Promise.all(
          staticSite.sources.map(async (source) => {
            const projection = await loadStaticSource(staticSite, source);
            if (!projection || !options.sectionIndex) {
              return projection;
            }
            const sectionIndex = await loadStaticSectionIndexForSource(staticSite, projection);
            return withStaticSectionIndex(projection, sectionIndex);
          }),
        )
      ).filter((source): source is StaticSourceProjection => Boolean(source))
    : [];

export const staticSourceFor = (
  staticSite: StaticSiteData | null,
  source: SourceItem,
): StaticSource | null => (staticSite ? findStaticSource(staticSite, source) : null);

export const sourceItemsFromStaticSite = (staticSite: StaticSiteData | null): SourceItem[] =>
  staticSite?.sources.map((source) => ({
    id: source.id,
    name: source.orgTitle ?? source.name,
    file: source.file,
    sourceFile: source.sourceFile,
  })) ?? [];

export const withStaticSiteSources = (
  config: SiteConfig,
  staticSite: StaticSiteData | null,
): SiteConfig => {
  const sources = sourceItemsFromStaticSite(staticSite);
  return sources.length > 0 ? { ...config, sources } : config;
};

export const isStaticSourceProjection = (
  source: SourceItem | StaticSource,
): source is StaticSourceProjection => "viewIndex" in source;

export const documentViewFromStaticSource = (
  source: StaticSourceProjection,
  agenda: AgendaSettings,
  memory: OrgizeMemoryResponseDto | null = source.memory ?? null,
  sectionIndex: OrgizeSectionIndexResponseDto | null = source.sectionIndex ?? null,
): OrgizeDocumentView => {
  let document = createDocumentView(
    source.viewIndex.records,
    source.lint.findings,
    sectionIndex?.records ?? [],
  );
  document = withAttachmentInventory(document, source.attachmentInventory);
  if (memory) {
    document = withAgentMemory(document, createAgentMemoryView(memory));
  }
  return withAgendaView(document, source.agendaView, source.agendaRange ?? agenda);
};

export const withStaticSectionIndex = (
  source: StaticSourceProjection,
  sectionIndex: OrgizeSectionIndexResponseDto | null,
): StaticSourceProjection => (sectionIndex ? { ...source, sectionIndex } : source);

const findStaticSource = (
  staticSite: StaticSiteData,
  source: SourceItem | StaticSource,
): StaticSource | null =>
  staticSite.sources.find(
    (item) =>
      item.sourceFile === source.sourceFile || item.file === source.file || item.id === source.id,
  ) ?? null;

const loadStaticSource = async (
  staticSite: StaticSiteData,
  source: StaticSource,
): Promise<StaticSourceProjection | null> => {
  if (isStaticSourceProjection(source)) {
    return source;
  }
  if (!source.shardPath) {
    return null;
  }
  const cache = sourceCacheFor(staticSite);
  const key = source.sourceFile;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const loaded = fetchStaticSourceShard(source.shardPath);
  cache.set(key, loaded);
  return loaded;
};

const sourceCacheFor = (
  staticSite: StaticSiteData,
): Map<string, Promise<StaticSourceProjection | null>> => {
  const cached = sourceCache.get(staticSite);
  if (cached) {
    return cached;
  }
  const next = new Map<string, Promise<StaticSourceProjection | null>>();
  sourceCache.set(staticSite, next);
  return next;
};

const memoryCacheFor = (
  staticSite: StaticSiteData,
): Map<string, Promise<OrgizeMemoryResponseDto | null>> => {
  const cached = memoryCache.get(staticSite);
  if (cached) {
    return cached;
  }
  const next = new Map<string, Promise<OrgizeMemoryResponseDto | null>>();
  memoryCache.set(staticSite, next);
  return next;
};

const sectionCacheFor = (
  staticSite: StaticSiteData,
): Map<string, Promise<OrgizeSectionIndexResponseDto | null>> => {
  const cached = sectionCache.get(staticSite);
  if (cached) {
    return cached;
  }
  const next = new Map<string, Promise<OrgizeSectionIndexResponseDto | null>>();
  sectionCache.set(staticSite, next);
  return next;
};

const fetchStaticSourceShard = async (
  shardPath: string,
): Promise<StaticSourceProjection | null> => {
  try {
    const response = await fetch(publicAssetUrl(shardPath));
    if (!response.ok) {
      return null;
    }
    const value = (await response.json()) as Partial<StaticSourceProjection>;
    return value.viewIndex && value.html !== undefined ? (value as StaticSourceProjection) : null;
  } catch {
    return null;
  }
};

const fetchStaticSectionShard = async (
  shardPath: string,
): Promise<OrgizeSectionIndexResponseDto | null> => {
  try {
    const response = await fetch(publicAssetUrl(shardPath));
    if (!response.ok) {
      return null;
    }
    const value = (await response.json()) as Partial<StaticSectionShard>;
    return value.schemaVersion === 1 && value.sectionIndex ? value.sectionIndex : null;
  } catch {
    return null;
  }
};

const fetchStaticMemoryShard = async (
  shardPath: string,
): Promise<OrgizeMemoryResponseDto | null> => {
  try {
    const response = await fetch(publicAssetUrl(shardPath));
    if (!response.ok) {
      return null;
    }
    const value = (await response.json()) as Partial<StaticMemoryShard>;
    return value.schemaVersion === 1 && value.memory ? value.memory : null;
  } catch {
    return null;
  }
};
