import type {
  OrgizeAgendaViewResponseDto,
  OrgizeAttachmentInventoryResponseDto,
  OrgizeLintResponseDto,
  OrgizeMemoryResponseDto,
  OrgizeSectionIndexResponseDto,
  OrgizeViewIndexResponseDto,
} from "orgize/dto";
import type { AgendaSettings, SourceItem } from "./config";
import { publicAssetUrl } from "./config";
import { createAgentMemoryView } from "./memoryModel";
import {
  createDocumentView,
  withAgendaView,
  withAgentMemory,
  withAttachmentInventory,
  type OrgizeDocumentView,
} from "./model";

export type StaticSourceProjection = {
  id: string;
  name: string;
  file: string;
  sourceFile: string;
  sourceBytes: number;
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
  sources: StaticSourceProjection[];
};

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

export const staticSourceFor = (
  staticSite: StaticSiteData | null,
  source: SourceItem,
): StaticSourceProjection | null =>
  staticSite?.sources.find(
    (item) =>
      item.sourceFile === source.sourceFile || item.file === source.file || item.id === source.id,
  ) ?? null;

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
  return withAgendaView(document, source.agendaView, agenda);
};
