import type {
  OrgizeAgentCapturePlanResponseDto,
  OrgizeAgentCaptureRequestDto,
  OrgizeAgendaViewResponseDto,
  OrgizeAttachmentInventoryResponseDto,
  OrgizeSectionIndexRecordDto,
  OrgizeLintFindingDto,
  OrgizeViewIndexRecordDto,
} from "orgize/dto";
import type { AgendaSettings } from "./config";
import type { CaptureApplyPreview } from "./captureApplyPreview";
import type { AgentMemoryView } from "./memoryModel";

export type ViewKey =
  | "blog"
  | "gallery"
  | "records"
  | "memory"
  | "travel"
  | "agenda"
  | "capture"
  | "diagnostics";

export type OrgizeDocumentView = {
  sectionIndex: OrgizeViewIndexRecordDto[];
  semanticSections: OrgizeSectionIndexRecordDto[];
  recordsByTag: ReadonlyMap<string, OrgizeViewIndexRecordDto[]>;
  recordsByRangeStart: ReadonlyMap<number, OrgizeViewIndexRecordDto>;
  agenda: AgendaItem[];
  agendaView: OrgizeAgendaViewResponseDto | null;
  agendaRange: AgendaSettings | null;
  attachmentInventory: OrgizeAttachmentInventoryResponseDto | null;
  agentMemory: AgentMemoryView | null;
  capturePlan: OrgizeAgentCapturePlanResponseDto | null;
  captureRequest: OrgizeAgentCaptureRequestDto | null;
  captureApplyPreview: CaptureApplyPreview | null;
  counts: {
    blog: number;
    attachments: number;
    records: number;
    memory: number;
    agenda: number;
  };
  lint: OrgizeLintFindingDto[] | null;
};

export type AttachmentDisplayRecord = OrgizeAttachmentInventoryResponseDto["display"][number];

export type AgendaItem = {
  kind: "scheduled" | "deadline" | "closed";
  title: string;
  tags: string[];
  value: string;
  rangeStart: number;
};

export const createDocumentView = (
  sectionIndex: OrgizeViewIndexRecordDto[],
  lint: OrgizeLintFindingDto[] | null = null,
  semanticSections: OrgizeSectionIndexRecordDto[] = [],
): OrgizeDocumentView => {
  const recordsByTag = indexRecordsByTag(sectionIndex);
  const recordsByRangeStart = indexRecordsByRangeStart(sectionIndex);
  const agenda = indexAgendaItems(sectionIndex);
  const notes = noteRecordsByPolicy(sectionIndex, null);
  return {
    sectionIndex,
    semanticSections,
    recordsByTag,
    recordsByRangeStart,
    agenda,
    agendaView: null,
    agendaRange: null,
    attachmentInventory: null,
    agentMemory: null,
    capturePlan: null,
    captureRequest: null,
    captureApplyPreview: null,
    counts: {
      blog: recordsByTag.get("blog")?.length ?? 0,
      attachments: recordsByTag.get("attach")?.length ?? 0,
      records: notes.length,
      memory: recordsByTag.get("memory")?.length ?? 0,
      agenda: agenda.length,
    },
    lint,
  };
};

export const withAgendaView = (
  document: OrgizeDocumentView,
  agendaView: OrgizeAgendaViewResponseDto,
  agendaRange: AgendaSettings,
): OrgizeDocumentView => ({
  ...document,
  agendaView,
  agendaRange,
  counts: {
    ...document.counts,
    agenda: agendaView.cards.length,
  },
});

export const withAttachmentInventory = (
  document: OrgizeDocumentView,
  attachmentInventory: OrgizeAttachmentInventoryResponseDto,
): OrgizeDocumentView => ({
  ...document,
  attachmentInventory,
  counts: {
    ...document.counts,
    attachments: attachmentInventory.display.length,
    records: noteRecordsByPolicy(document.sectionIndex, attachmentInventory).length,
  },
});

export const withAgentMemory = (
  document: OrgizeDocumentView,
  agentMemory: AgentMemoryView,
): OrgizeDocumentView => ({
  ...document,
  agentMemory,
  counts: {
    ...document.counts,
    memory: agentMemory.response.stats.totalRecords,
  },
});

export const withCapturePlan = (
  document: OrgizeDocumentView,
  capturePlan: OrgizeAgentCapturePlanResponseDto,
  captureRequest: OrgizeAgentCaptureRequestDto,
  captureApplyPreview: CaptureApplyPreview,
): OrgizeDocumentView => ({
  ...document,
  capturePlan,
  captureRequest,
  captureApplyPreview,
});

export const withLint = (
  document: OrgizeDocumentView,
  lint: OrgizeLintFindingDto[],
): OrgizeDocumentView => ({
  ...document,
  lint,
});

export const taggedRecords = (
  document: OrgizeDocumentView | null,
  tag: string,
): OrgizeViewIndexRecordDto[] => document?.recordsByTag.get(normalizeTag(tag)) ?? [];

export const noteRecords = (document: OrgizeDocumentView | null): OrgizeViewIndexRecordDto[] =>
  document ? noteRecordsByPolicy(document.sectionIndex, document.attachmentInventory) : [];

export const blogArticles = (document: OrgizeDocumentView | null): OrgizeViewIndexRecordDto[] =>
  articleRoots(taggedRecords(document, "blog"));

export const attachmentDisplayRecords = (
  document: OrgizeDocumentView | null,
): AttachmentDisplayRecord[] => document?.attachmentInventory?.display ?? [];

export const agendaItems = (document: OrgizeDocumentView | null): AgendaItem[] =>
  document?.agenda ?? [];

const articleRoots = (records: OrgizeViewIndexRecordDto[]): OrgizeViewIndexRecordDto[] => {
  const roots: OrgizeViewIndexRecordDto[] = [];
  let currentRoot: OrgizeViewIndexRecordDto | null = null;
  for (const record of records) {
    if (currentRoot && record.level > currentRoot.level) {
      continue;
    }
    roots.push(record);
    currentRoot = record;
  }
  return roots;
};

const indexRecordsByTag = (
  records: OrgizeViewIndexRecordDto[],
): Map<string, OrgizeViewIndexRecordDto[]> => {
  const recordsByTag = new Map<string, OrgizeViewIndexRecordDto[]>();
  for (const record of records) {
    for (const tag of record.effectiveTags) {
      const key = normalizeTag(tag);
      const tagged = recordsByTag.get(key);
      if (tagged) {
        tagged.push(record);
      } else {
        recordsByTag.set(key, [record]);
      }
    }
  }
  return recordsByTag;
};

const indexRecordsByRangeStart = (
  records: OrgizeViewIndexRecordDto[],
): Map<number, OrgizeViewIndexRecordDto> => {
  const recordsByRangeStart = new Map<number, OrgizeViewIndexRecordDto>();
  for (const record of records) {
    recordsByRangeStart.set(record.rangeStart, record);
  }
  return recordsByRangeStart;
};

const indexAgendaItems = (records: OrgizeViewIndexRecordDto[]): AgendaItem[] => {
  const items: AgendaItem[] = [];
  for (const record of records) {
    addPlanning(items, record, "scheduled");
    addPlanning(items, record, "deadline");
    addPlanning(items, record, "closed");
  }
  return items.sort((left, right) => left.rangeStart - right.rangeStart);
};

const normalizeTag = (tag: string): string => tag.toLowerCase();

const noteRecordsByPolicy = (
  records: OrgizeViewIndexRecordDto[],
  attachmentInventory: OrgizeAttachmentInventoryResponseDto | null,
): OrgizeViewIndexRecordDto[] => {
  const attachmentRanges = new Set(
    attachmentInventory?.display.map((attachment) => attachment.source.rangeStart) ?? [],
  );
  return records.filter((record) => isNoteRecord(record, attachmentRanges));
};

const isNoteRecord = (
  record: OrgizeViewIndexRecordDto,
  attachmentRanges: ReadonlySet<number>,
): boolean => {
  if (!record.title.trim()) {
    return false;
  }
  const tags = new Set(record.effectiveTags.map(normalizeTag));
  return tags.has("record") || tags.has("attach") || attachmentRanges.has(record.rangeStart);
};

const addPlanning = (
  items: AgendaItem[],
  record: OrgizeViewIndexRecordDto,
  kind: AgendaItem["kind"],
) => {
  const raw = record.planning[kind];
  if (!raw) {
    return;
  }
  items.push({
    kind,
    title: record.title,
    tags: record.effectiveTags,
    value: raw,
    rangeStart: record.rangeStart,
  });
};
