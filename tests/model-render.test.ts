import type {
  OrgizeMemoryRecordDto,
  OrgizeSectionIndexRecordDto,
  OrgizeSourceRangeDto,
  OrgizeTextSliceDto,
  OrgizeViewIndexRecordDto,
} from "orgize/dto";
import { describe, expect, it } from "vitest";
import { createAgentMemoryView } from "../src/memoryModel";
import {
  createDocumentView,
  noteRecords,
  withAgendaView,
  withAgentMemory,
  withAttachmentInventory,
} from "../src/model";
import { renderView } from "../src/render";
import { documentViewFromStaticSource, staticSourceFor } from "../src/staticSiteData";
import { staticProjection } from "./staticProjection.fixture";
import { viewCacheKey } from "../src/viewCache";

describe("Org source view fallbacks", () => {
  it("uses semantic headings as Notes when a real attachment source has no :record: tags", () => {
    const document = createDocumentView([
      record({
        title: "Wallpaper Attachment Gallery",
        effectiveTags: ["ATTACH", "house"],
      }),
      record({
        rangeStart: 120,
        title: "Blog-only heading",
        effectiveTags: ["blog"],
      }),
    ]);

    expect(document.counts.records).toBe(1);
    expect(noteRecords(document).map((item) => item.title)).toEqual([
      "Wallpaper Attachment Gallery",
    ]);
    expect(renderView({ view: "records", document })).toContain("Wallpaper Attachment Gallery");
  });

  it("keeps explicit :record: notes as the primary Notes surface", () => {
    const document = createDocumentView([
      record({
        title: "Attachment-only heading",
        effectiveTags: ["ATTACH"],
      }),
      record({
        title: "Typed note",
        effectiveTags: ["record", "ATTACH"],
      }),
    ]);

    expect(document.counts.records).toBe(1);
    expect(noteRecords(document).map((item) => item.title)).toEqual(["Typed note"]);
  });

  it("shows source planning data when agenda projection has no rows in the configured window", () => {
    const document = createDocumentView([
      record({
        title: "Bathroom Design",
        effectiveTags: ["ATTACH", "house"],
        planning: {
          scheduled: "<2020-12-19 Sat>-<2020-12-19 Sat>",
        },
      }),
    ]);
    const projected = withAgendaView(
      document,
      {
        schemaVersion: 1,
        totalCandidates: 0,
        sortStrategy: [],
        cards: [],
        skipped: [],
      },
      {
        start: { year: 2026, month: 5, day: 15 },
        days: 7,
        end: { year: 2026, month: 5, day: 21 },
        label: "2026-05-15 to 2026-05-21",
        limit: 32,
        mode: "classic",
      },
    );

    const html = renderView({ view: "agenda", document: projected });

    expect(projected.counts.agenda).toBe(1);
    expect(html).toContain("Agenda window 2026-05-15 to 2026-05-21 has no projected rows.");
    expect(html).toContain("Bathroom Design");
    expect(html).toContain("&lt;2020-12-19 Sat&gt;-&lt;2020-12-19 Sat&gt;");
  });

  it("renders Notes through the shared Org HTML record renderer", () => {
    const document = createDocumentView(
      [
        record({
          bodyPreview: "Plain fallback should not be primary",
          effectiveTags: ["record"],
          rangeStart: 42,
          title: "[[https://example.com/wallpaper][Wallpaper]]",
        }),
      ],
      null,
      [sectionRecord({ rangeStart: 42, title: "[[https://example.com/wallpaper][Wallpaper]]" })],
    );

    const html = renderView({
      view: "records",
      document,
      articleHtml: `
        <main>
          <h2>Wallpaper</h2>
          <p>Rendered paragraph with <a href="https://example.com">a link</a>.</p>
          <pre><code>#+BEGIN_SRC rust</code></pre>
        </main>
      `,
    });

    expect(html).toContain("org-record-render");
    expect(html).toContain("Rendered paragraph");
    expect(html).toContain("<pre>");
    expect(html).not.toContain("Plain fallback should not be primary");
  });

  it("keeps Notes source metadata when the HTML exporter omits Org keyword lines", () => {
    const source = sourceRange(99);
    const document = createDocumentView(
      [
        record({
          bodyPreview: "Plain fallback should not be primary",
          effectiveTags: ["record"],
          rangeStart: 99,
          title: "Semantic source title",
        }),
      ],
      null,
      [
        sectionRecord({
          body: [
            {
              source,
              text: [
                "#+DOWNLOADED: https://example.com/original.jpg",
                "[[attachment:local-copy.jpg]]",
              ].join("\n"),
            },
          ],
          rangeStart: 99,
          title: "Semantic source title",
        }),
      ],
    );

    const html = renderView({
      view: "records",
      document,
      articleHtml: `
        <main>
          <h2>Exporter visible title</h2>
          <p><img src="attachment:local-copy.jpg"></p>
        </main>
      `,
    });

    expect(html).toContain("org-record-render");
    expect(html).toContain("local-copy.jpg");
    expect(html).toContain("#+DOWNLOADED: https://example.com/original.jpg");
    expect(html).not.toContain("Plain fallback should not be primary");
  });

  it("falls back to semantic source body when a Note has no rendered HTML section", () => {
    const source = sourceRange(123);
    const document = createDocumentView(
      [
        record({
          bodyPreview: "Plain fallback should not be primary",
          effectiveTags: ["record"],
          rangeStart: 123,
          title: "Source-only note",
        }),
      ],
      null,
      [
        sectionRecord({
          body: [{ source, text: "Source-only body from semantic section." }],
          rangeStart: 123,
          title: "Source-only note",
        }),
      ],
    );

    const html = renderView({
      view: "records",
      document,
      articleHtml: "<main><h2>Different note</h2></main>",
    });

    expect(html).toContain("org-record-render--source");
    expect(html).toContain("Source-only body from semantic section.");
    expect(html).not.toContain("Plain fallback should not be primary");
  });

  it("renders Memory records through the same Org HTML record renderer", () => {
    const source = sourceRange(84);
    const document = withAgentMemory(
      createDocumentView(
        [
          record({
            bodyPreview: "Plain memory fallback",
            effectiveTags: ["memory"],
            rangeStart: 84,
            title: "Memory heading",
          }),
        ],
        null,
        [sectionRecord({ rangeStart: 84, title: "Memory heading" })],
      ),
      createAgentMemoryView({
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
        records: [memoryRecord({ source, title: "Memory heading" })],
        cards: [],
        evidenceKinds: [],
        authorityKinds: [],
      }),
    );

    const html = renderView({
      view: "memory",
      document,
      articleHtml: `
        <main>
          <h2>Memory heading</h2>
          <p>Rendered memory paragraph with <code>inline code</code>.</p>
        </main>
      `,
    });

    expect(html).toContain("org-record-render--memory");
    expect(html).toContain("Rendered memory paragraph");
    expect(html).not.toContain("Plain memory fallback");
  });

  it("separates cache keys by source and late projection state", () => {
    const baseDocument = createDocumentView([record({ rangeStart: 7, title: "Cached note" })]);
    const attachmentDocument = withAttachmentInventory(baseDocument, {
      schemaVersion: 1,
      entries: [
        {
          source: sourceRange(7),
          sectionTitle: "Cached note",
          kind: { label: "link", link: { path: "image.jpg" } },
          path: "image.jpg",
          absolutePath: "/tmp/image.jpg",
          exists: true,
          vcs: {
            status: "notChecked",
            annex: { status: "notChecked" },
          },
        },
      ],
      display: [
        {
          source: sourceRange(7),
          sectionTitle: "Cached note",
          sectionTitleText: "Cached note",
          outlinePath: ["Cached note"],
          outlinePathText: ["Cached note"],
          tags: [],
          effectiveTags: [],
          directoryPath: ".attach/id",
          linkPath: "image.jpg",
          absolutePath: "/tmp/image.jpg",
          exists: true,
          mediaKind: "image",
        },
      ],
      syncPlan: { actions: [] },
      archiveAdvice: [],
      warnings: [],
    });

    const pendingKey = cacheKeyFor(baseDocument, "records", "org-zhixing-demo.org", "");
    const renderedKey = cacheKeyFor(
      baseDocument,
      "records",
      "org-zhixing-demo.org",
      "<main></main>",
    );
    const attachmentKey = cacheKeyFor(
      attachmentDocument,
      "records",
      "org-zhixing-demo.org",
      "<main></main>",
    );
    const otherSourceKey = cacheKeyFor(
      attachmentDocument,
      "records",
      "wallpaper-gallery.org",
      "<main></main>",
    );

    expect(new Set([pendingKey, renderedKey, attachmentKey, otherSourceKey]).size).toBe(4);
  });

  it("hydrates a complete document view from the production static projection", () => {
    const staticSource = staticProjection();
    const matched = staticSourceFor(
      {
        schemaVersion: 1,
        generatedAt: "2026-05-20T00:00:00.000Z",
        configPath: "org-zhixing.toml",
        orgize: { buildTime: "test", gitHash: "test" },
        sources: [staticSource],
      },
      {
        id: "wallpaper-gallery",
        name: "Wallpaper Attachment Gallery",
        file: "wallpaper-gallery.org",
        sourceFile: "blog/wallpaper-gallery.org",
      },
    );

    expect(matched).toBe(staticSource);

    const document = documentViewFromStaticSource(staticSource, {
      start: { year: 2026, month: 5, day: 15 },
      days: 7,
      end: { year: 2026, month: 5, day: 21 },
      label: "2026-05-15 to 2026-05-21",
      limit: 32,
      mode: "classic",
    });

    expect(document.counts.attachments).toBe(1);
    expect(document.counts.memory).toBe(1);
    expect(document.lint).toEqual([]);
    expect(renderView({ view: "gallery", document })).toContain("1 display items");
    expect(
      renderView({
        view: "records",
        document,
        articleHtml: staticSource.html,
      }),
    ).toContain("Static rendered body");
  });
});

const record = ({
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

const sectionRecord = ({
  body = [],
  rangeStart,
  title,
}: {
  body?: OrgizeTextSliceDto[];
  rangeStart: number;
  title: string;
}): OrgizeSectionIndexRecordDto => ({
  source: sourceRange(rangeStart),
  outlinePath: [title],
  outlinePathText: [title.replace(/\[\[[^\]]+\]\[([^\]]+)\]\]/g, "$1")],
  level: 1,
  title,
  titleText: title.replace(/\[\[[^\]]+\]\[([^\]]+)\]\]/g, "$1"),
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
  tags: [],
  effectiveTags: [],
  properties: [],
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
  links: [],
  targets: [],
  lifecycle: [],
});

const memoryRecord = ({
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

const sourceRange = (rangeStart: number): OrgizeSourceRangeDto => ({
  start: { line: rangeStart, column: 1 },
  end: { line: rangeStart, column: 1 },
  rangeStart,
  rangeEnd: rangeStart + 10,
});

const cacheKeyFor = (
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
