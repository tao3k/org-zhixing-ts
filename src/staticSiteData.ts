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
  type OrgizeDocumentView,
} from "./model";
import type { AttachmentGalleryView } from "./attachmentGalleryModel";
import type { TravelView } from "./travelModel";

export type StaticSourceSummary = {
  id: string;
  name: string;
  file: string;
  sourceFile: string;
  sourceBytes: number;
  shardPath?: string;
};

export type StaticSourceProjection = {
  id: string;
  name: string;
  file: string;
  sourceFile: string;
  sourceBytes: number;
  agendaRange?: AgendaSettings;
  viewIndex: OrgizeViewIndexResponseDto;
  sectionIndex: OrgizeSectionIndexResponseDto;
  html: string;
  attachmentInventory: OrgizeAttachmentInventoryResponseDto;
  memory: OrgizeMemoryResponseDto;
  agendaView: OrgizeAgendaViewResponseDto;
  lint: OrgizeLintResponseDto;
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
  travel?: TravelView;
  sources: StaticSource[];
};

export type StaticSource = StaticSourceProjection | StaticSourceSummary;

const sourceCache = new WeakMap<
  StaticSiteData,
  Map<string, Promise<StaticSourceProjection | null>>
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
  const matched =
    staticSite.sources.find(
      (item) =>
        item.sourceFile === source.sourceFile || item.file === source.file || item.id === source.id,
    ) ?? null;
  return matched ? loadStaticSource(staticSite, matched) : null;
};

export const loadAllStaticSources = async (
  staticSite: StaticSiteData | null,
): Promise<StaticSourceProjection[]> =>
  staticSite
    ? (
        await Promise.all(staticSite.sources.map((source) => loadStaticSource(staticSite, source)))
      ).filter((source): source is StaticSourceProjection => Boolean(source))
    : [];

export const staticSourceFor = (
  staticSite: StaticSiteData | null,
  source: SourceItem,
): StaticSource | null =>
  staticSite?.sources.find(
    (item) =>
      item.sourceFile === source.sourceFile || item.file === source.file || item.id === source.id,
  ) ?? null;

export const sourceItemsFromStaticSite = (staticSite: StaticSiteData | null): SourceItem[] =>
  staticSite?.sources.map((source) => ({
    id: source.id,
    name: source.name,
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

export const isStaticSourceProjection = (source: StaticSource): source is StaticSourceProjection =>
  "viewIndex" in source;

export const documentViewFromStaticSource = (
  source: StaticSourceProjection,
  agenda: AgendaSettings,
): OrgizeDocumentView => {
  let document = createDocumentView(
    source.viewIndex.records,
    source.lint.findings,
    source.sectionIndex.records,
  );
  document = withAttachmentInventory(document, source.attachmentInventory);
  document = withAgentMemory(document, createAgentMemoryView(source.memory));
  return withAgendaView(document, source.agendaView, source.agendaRange ?? agenda);
};

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

const fetchStaticSourceShard = async (
  shardPath: string,
): Promise<StaticSourceProjection | null> => {
  try {
    const response = await fetch(publicAssetUrl(shardPath));
    if (!response.ok) {
      return null;
    }
    const value = (await response.json()) as Partial<StaticSourceProjection>;
    return value.viewIndex && value.sectionIndex && value.html !== undefined
      ? (value as StaticSourceProjection)
      : null;
  } catch {
    return null;
  }
};
