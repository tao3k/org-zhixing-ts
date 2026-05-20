import type {
  OrgizeMemoryRecordDto,
  OrgizeSourceRangeDto,
  OrgizeViewIndexRecordDto,
} from "orgize/dto";
import type { StaticSourceProjection } from "../src/staticSiteData";

export const staticProjection = (): StaticSourceProjection => {
  const source = sourceRange(7);
  return {
    id: "wallpaper-gallery",
    name: "Wallpaper Attachment Gallery",
    file: "wallpaper-gallery.org",
    sourceFile: "blog/wallpaper-gallery.org",
    sourceBytes: 128,
    viewIndex: {
      schemaVersion: 1,
      records: [
        record({
          bodyPreview: "Static fallback",
          effectiveTags: ["ATTACH", "memory"],
          rangeStart: 7,
          title: "Static Gallery",
        }),
      ],
    },
    sectionIndex: {
      schemaVersion: 1,
      records: [
        {
          source,
          outlinePath: ["Static Gallery"],
          outlinePathText: ["Static Gallery"],
          level: 1,
          title: "Static Gallery",
          titleText: "Static Gallery",
          body: [],
          todo: null,
          todoState: null,
          priority: {
            effective: "B",
            isDefault: true,
            rangeStatus: "inRange",
            profile: { highest: "A", lowest: "C", default: "B" },
          },
          category: null,
          tags: [],
          effectiveTags: [],
          properties: [],
          effectiveProperties: [],
          specialProperties: [],
          planning: {},
          isComment: false,
          archive: { archived: false, hasArchiveTag: false },
          attachment: { hasAttachTag: false },
          links: [],
          targets: [],
          lifecycle: [],
        },
      ],
    },
    html: "<main><h1>Static Gallery</h1><p>Static rendered body</p></main>",
    attachmentInventory: attachmentInventory(source),
    memory: {
      schemaVersion: 1,
      stats: {
        totalRecords: 1,
        currentRecords: 1,
        backgroundRecords: 0,
        closedRecords: 0,
        archivedRecords: 0,
        cards: 0,
        actionCards: 0,
        suppressedCards: 0,
        infoCards: 0,
        evidence: 0,
        properties: 0,
        links: 0,
        authorityReasons: 0,
      },
      records: [memoryRecord(source)],
      cards: [],
      evidenceKinds: [],
      authorityKinds: [],
    },
    agendaView: {
      schemaVersion: 1,
      totalCandidates: 0,
      limit: 32,
      sortStrategy: [],
      cards: [],
      skipped: [],
    },
    lint: {
      schemaVersion: 1,
      findings: [],
    },
  };
};

const attachmentInventory = (source: OrgizeSourceRangeDto) => ({
  schemaVersion: 1 as const,
  entries: [
    {
      source,
      sectionTitle: "Static Gallery",
      kind: { label: "link" as const, link: { path: "static.jpg" } },
      path: "static.jpg",
      absolutePath: "/tmp/static.jpg",
      exists: true,
      vcs: {
        status: "notChecked" as const,
        annex: { status: "notChecked" as const },
      },
    },
  ],
  display: [
    {
      source,
      sectionTitle: "Static Gallery",
      sectionTitleText: "Static Gallery",
      outlinePath: ["Static Gallery"],
      outlinePathText: ["Static Gallery"],
      tags: [],
      effectiveTags: [],
      directoryPath: ".attach/id",
      linkPath: "static.jpg",
      absolutePath: "/tmp/static.jpg",
      exists: true,
      mediaKind: "image" as const,
    },
  ],
  syncPlan: { actions: [] },
  archiveAdvice: [],
  warnings: [],
});

const record = ({
  bodyPreview,
  effectiveTags,
  rangeStart,
  title,
}: Pick<
  OrgizeViewIndexRecordDto,
  "bodyPreview" | "effectiveTags" | "rangeStart" | "title"
>): OrgizeViewIndexRecordDto => ({
  bodyPreview,
  effectiveTags,
  rangeStart,
  title,
  level: 1,
  outline: title,
  planning: { scheduled: "<2020-12-19 Sat>-<2020-12-19 Sat>" },
  properties: [],
  todo: null,
  todoState: null,
});

const memoryRecord = (source: OrgizeSourceRangeDto): OrgizeMemoryRecordDto => ({
  source,
  state: "current",
  level: 1,
  title: "Static Gallery",
  todo: null,
  todoState: null,
  tags: ["memory"],
  effectiveTags: ["memory"],
  anchor: null,
  properties: [],
  evidence: [],
  links: [],
});

const sourceRange = (rangeStart: number): OrgizeSourceRangeDto => ({
  start: { line: rangeStart, column: 1 },
  end: { line: rangeStart, column: 1 },
  rangeStart,
  rangeEnd: rangeStart + 10,
});
