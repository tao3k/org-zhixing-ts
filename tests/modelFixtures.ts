import type {
  OrgizeAgentMemoryCardDto,
  OrgizeMemoryRecordDto,
  OrgizeMemoryResponseDto,
  OrgizeSectionIndexRecordDto,
  OrgizeSourceRangeDto,
  OrgizeTextSliceDto,
  OrgizeViewIndexRecordDto,
} from "orgize/dto";
import { createDocumentView } from "../src/model";
import { viewCacheKey } from "../src/viewCache";

export const record = ({
  bodyPreview = "",
  effectiveTags = [],
  level = 1,
  outline,
  planning = {},
  properties = [],
  rangeStart = 0,
  title,
  todo = null,
  todoState = null,
}: Partial<OrgizeViewIndexRecordDto> & { title: string }): OrgizeViewIndexRecordDto => ({
  bodyPreview,
  effectiveTags,
  level,
  outline: outline ?? title,
  planning,
  properties,
  rangeStart,
  title,
  todo,
  todoState,
});

export const sectionRecord = ({
  body = [],
  effectiveTags = [],
  level = 1,
  links = [],
  outlinePath,
  outlinePathText,
  properties = [],
  rangeStart,
  tags = [],
  title,
}: {
  body?: OrgizeTextSliceDto[];
  effectiveTags?: string[];
  level?: number;
  links?: OrgizeSectionIndexRecordDto["links"];
  outlinePath?: string[];
  outlinePathText?: string[];
  properties?: OrgizeSectionIndexRecordDto["properties"];
  rangeStart: number;
  tags?: string[];
  title: string;
}): OrgizeSectionIndexRecordDto => {
  const titleText = title.replace(/\[\[[^\]]+\]\[([^\]]+)\]\]/g, "$1");
  return {
    source: sourceRange(rangeStart),
    outlinePath: outlinePath ?? [title],
    outlinePathText: outlinePathText ?? [titleText],
    level,
    title,
    titleText,
    body,
    todo: null,
    todoState: null,
    priority: {
      effective: "B",
      isDefault: true,
      rangeStatus: "inRange",
      profile: {
        highest: "A",
        lowest: "C",
        default: "B",
      },
    },
    category: null,
    tags,
    effectiveTags,
    properties,
    effectiveProperties: [],
    specialProperties: [],
    planning: {},
    isComment: false,
    archive: {
      archived: false,
      hasArchiveTag: false,
    },
    attachment: {
      hasAttachTag: false,
    },
    links,
    targets: [],
    lifecycle: [],
  };
};

export const memoryRecord = ({
  source,
  title,
}: {
  source: OrgizeSourceRangeDto;
  title: string;
}): OrgizeMemoryRecordDto => ({
  source,
  state: "current",
  level: 1,
  title,
  todo: null,
  todoState: null,
  tags: ["memory"],
  effectiveTags: ["memory"],
  anchor: null,
  properties: [],
  evidence: [],
  links: [],
});

export const memoryResponse = ({
  cards = [],
  source,
  title,
}: {
  cards?: OrgizeAgentMemoryCardDto[];
  source: OrgizeSourceRangeDto;
  title: string;
}): OrgizeMemoryResponseDto => ({
  schemaVersion: 1,
  stats: {
    totalRecords: 1,
    currentRecords: 1,
    backgroundRecords: 0,
    closedRecords: 0,
    archivedRecords: 0,
    cards: cards.length,
    actionCards: cards.filter((card) => card.decision.severity === "action").length,
    suppressedCards: cards.filter((card) => card.decision.severity === "suppressed").length,
    infoCards: cards.filter((card) => card.decision.severity === "info").length,
    evidence: 0,
    properties: 0,
    links: 0,
    authorityReasons: 0,
  },
  records: [memoryRecord({ source, title })],
  cards,
  evidenceKinds: [],
  authorityKinds: [],
});

export const sourceRange = (rangeStart: number): OrgizeSourceRangeDto => ({
  start: { line: rangeStart, column: 1 },
  end: { line: rangeStart, column: 1 },
  rangeStart,
  rangeEnd: rangeStart + 10,
});

export const cacheKeyFor = (
  document: ReturnType<typeof createDocumentView>,
  view: "records",
  sourceFile: string,
  renderedHtml: string,
): string =>
  viewCacheKey({
    agendaMode: "classic",
    agendaPanel: "trace",
    agendaRuleId: null,
    blog: { articleRangeStart: null, zenMode: false },
    document,
    renderedHtml,
    sourceItem: {
      id: sourceFile,
      name: sourceFile,
      file: sourceFile,
      sourceFile: `blog/${sourceFile}`,
    },
    view,
  });
