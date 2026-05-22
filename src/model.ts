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

export type BlogArticleRecord = Pick<
  OrgizeViewIndexRecordDto,
  | "bodyPreview"
  | "effectiveTags"
  | "level"
  | "outline"
  | "planning"
  | "properties"
  | "rangeStart"
  | "title"
  | "todo"
  | "todoState"
> & {
  sourceFile?: string;
  sourceName?: string;
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
      blog: blogArticlesFromDocument(sectionIndex, semanticSections).length,
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

export const withSemanticSections = (
  document: OrgizeDocumentView,
  semanticSections: OrgizeSectionIndexRecordDto[],
): OrgizeDocumentView => ({
  ...document,
  semanticSections,
  counts: {
    ...document.counts,
    blog: blogArticlesFromDocument(document.sectionIndex, semanticSections).length,
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

export const blogArticles = (document: OrgizeDocumentView | null): BlogArticleRecord[] =>
  document ? blogArticlesFromDocument(document.sectionIndex, document.semanticSections) : [];

export const attachmentDisplayRecords = (
  document: OrgizeDocumentView | null,
): AttachmentDisplayRecord[] => document?.attachmentInventory?.display ?? [];

export const agendaItems = (document: OrgizeDocumentView | null): AgendaItem[] =>
  document?.agenda ?? [];

const blogArticlesFromDocument = (
  sectionIndex: OrgizeViewIndexRecordDto[],
  semanticSections: OrgizeSectionIndexRecordDto[],
): BlogArticleRecord[] => {
  const firstSection = semanticSections[0];
  if (firstSection) {
    return [blogArticleFromSectionRecord(firstSection)];
  }
  const firstRecord = sectionIndex[0];
  return firstRecord ? [firstRecord] : [];
};

const blogArticleFromSectionRecord = (record: OrgizeSectionIndexRecordDto): BlogArticleRecord => ({
  bodyPreview: sectionBodyPreview(record),
  effectiveTags: record.effectiveTags,
  level: record.level,
  outline: (record.outlinePathText ?? record.outlinePath).join(" / "),
  planning: {
    closed: planningText(record.planning.closed),
    deadline: planningText(record.planning.deadline),
    scheduled: planningText(record.planning.scheduled),
  },
  properties: record.properties,
  rangeStart: record.source.rangeStart,
  title: sectionTitleText(record),
  todo: record.todo,
  todoState: record.todoState,
});

const sectionBodyPreview = (record: OrgizeSectionIndexRecordDto): string =>
  record.body
    .map((slice) => slice.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 260);

const sectionTitleText = (record: OrgizeSectionIndexRecordDto): string =>
  record.titleText || orgTitleText(record.title);

const orgTitleText = (value: string): string =>
  value.replace(/\[\[([^\]]+)\]\[([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1");

const planningText = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return typeof value === "object" && "raw" in value && typeof value.raw === "string"
    ? value.raw
    : null;
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
