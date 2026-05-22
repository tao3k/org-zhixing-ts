import { describe, expect, it } from "vitest";
import { sourcePlanningAgendaRange } from "../src/agendaRange";
import { attachmentGalleryFromSources } from "../src/attachmentGalleryModel";
import { applyHtmlEmbedPolicy } from "../src/htmlEmbedPolicy";
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
import {
  buildGoogleMapsEmbedUrl,
  buildGoogleMapsSearchUrl,
  createTravelView,
  createTravelViewFromSources,
} from "../src/travelModel";
import { cacheKeyFor, memoryResponse, record, sectionRecord, sourceRange } from "./modelFixtures";
import { staticProjection } from "./staticProjection.fixture";

describe("Org source view projections", () => {
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

  it("keeps explicit :record: and attachment-backed headings in Notes", () => {
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

    expect(document.counts.records).toBe(2);
    expect(noteRecords(document).map((item) => item.title)).toEqual([
      "Attachment-only heading",
      "Typed note",
    ]);
  });

  it("renders attachment tags through the shared Org tag atom", () => {
    const source = sourceRange(17);
    const document = withAttachmentInventory(createDocumentView([]), {
      schemaVersion: 1,
      entries: [
        {
          source,
          sectionTitle: "Tagged image",
          kind: { label: "link", link: { path: "tagged.jpg" } },
          path: "tagged.jpg",
          absolutePath: "/tmp/tagged.jpg",
          exists: true,
          vcs: {
            status: "notChecked",
            annex: { status: "notChecked" },
          },
        },
      ],
      display: [
        {
          source,
          sectionTitle: "Tagged image",
          sectionTitleText: "Tagged image",
          outlinePath: ["Tagged image"],
          outlinePathText: ["Tagged image"],
          tags: ["ATTACH"],
          effectiveTags: ["ATTACH", "gallery"],
          directoryPath: ".attach/id",
          linkPath: "tagged.jpg",
          absolutePath: "/tmp/tagged.jpg",
          exists: true,
          mediaKind: "image",
        },
      ],
      syncPlan: { actions: [] },
      archiveAdvice: [],
      warnings: [],
    });

    const html = renderView({ view: "gallery", document, sourceFile: "blog/gallery.org" });

    expect(html).toContain("attachment-card");
    expect(html).toContain("meta-row org-meta-row");
    expect(html).toContain("org-meta-row--tags");
    expect(html).toContain("org-meta-tag");
    expect(html).toContain("ATTACH");
    expect(html).toContain("gallery");
  });

  it("does not synthesize Agenda rows from source planning when WASM returns no rows", () => {
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

    expect(projected.counts.agenda).toBe(0);
    expect(html).toContain("No WASM agenda rows in 2026-05-15 to 2026-05-21.");
    expect(html).not.toContain("Bathroom Design");
    expect(html).not.toContain("&lt;2020-12-19 Sat&gt;-&lt;2020-12-19 Sat&gt;");
    expect(html).not.toContain("source planning");
  });

  it("uses shared Org-native atoms inside Agenda rows", () => {
    const document = createDocumentView([
      record({
        effectiveTags: ["agenda", "focus"],
        planning: { scheduled: "<2026-05-16 Sat 11:00>" },
        rangeStart: 12,
        title: "Agenda native row",
        todo: "NEXT",
        todoState: "todo",
      }),
    ]);
    const projected = withAgendaView(
      document,
      {
        schemaVersion: 1,
        totalCandidates: 1,
        sortStrategy: [],
        cards: [
          {
            source: sourceRange(12),
            sortedPosition: 0,
            kind: "scheduled",
            displayDate: "2026-05-16",
            targetDate: "2026-05-16",
            targetEndDate: null,
            time: "11:00",
            endTime: null,
            title: "Agenda native row",
            category: null,
            todo: "NEXT",
            todoState: "todo",
            effectiveTags: ["agenda", "focus"],
            blockers: [],
            urgency: { total: 0, ingredients: [] },
            sortKeys: [],
            receipts: [{ kind: "scheduled", message: "WASM agenda projection" }],
          },
        ],
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

    expect(html).toContain("agenda-row-title");
    expect(html).toContain("agenda-title-markers org-heading-markers");
    expect(html).toContain("org-heading-todo org-heading-todo--focus");
    expect(html).toContain("org-planning-chip org-planning-chip--scheduled");
    expect(html).toContain("org-timestamp org-timestamp--raw");
    expect(html).toContain("Agenda native row");
  });

  it("renders Blog as an index first and enters Zen only after article selection", () => {
    const document = createDocumentView(
      [
        record({
          effectiveTags: ["blog", "agent", "design"],
          properties: [{ key: "DATE", value: "<2026-05-17 Sun>" }],
          rangeStart: 30,
          title: "Elegant Org Frame",
        }),
        record({
          effectiveTags: ["blog", "syntax"],
          properties: [{ key: "DATE", value: "<2026-05-16 Sat>" }],
          rangeStart: 60,
          title: "Second Article",
        }),
      ],
      null,
      [
        sectionRecord({
          effectiveTags: ["blog", "agent", "design"],
          properties: [{ key: "DATE", source: sourceRange(30), value: "<2026-05-17 Sun>" }],
          rangeStart: 30,
          title: "Elegant Org Frame",
        }),
        sectionRecord({
          effectiveTags: ["blog", "syntax"],
          properties: [{ key: "DATE", source: sourceRange(60), value: "<2026-05-16 Sat>" }],
          rangeStart: 60,
          title: "Second Article",
        }),
      ],
    );

    const html = renderView({
      view: "blog",
      document,
      articleHtml: `
        <main>
          <h1>Elegant Org Frame</h1>
          <section>
            <h2>Native rhythm</h2>
            <p>Readable body.</p>
          </section>
        </main>
      `,
    });

    expect(html).toContain('class="blog-index"');
    expect(html).toContain("Blog Index");
    expect(html).toContain("1 Org files");
    expect(html).toContain("2 tag facets");
    expect(html).toContain('class="blog-time-thresholds"');
    expect(html).toContain('class="blog-tag-filter"');
    expect(html).toContain('class="blog-reasoning-paths"');
    expect(html).toContain('data-blog-tag="agent"');
    expect(html).toContain('data-blog-time="2026-05-17"');
    expect(html).toContain('data-blog-article="30"');
    expect(html).not.toContain('data-blog-article="60"');
    expect(html).not.toContain("Native rhythm");
    expect(html).not.toContain('class="rendered-html blog-article"');

    const zenHtml = renderView({
      view: "blog",
      document,
      blogArticleRangeStart: 30,
      blogZenMode: true,
      articleHtml: `
        <main>
          <h1>Elegant Org Frame</h1>
          <section>
            <h2>Native rhythm</h2>
            <p>Readable body.</p>
          </section>
        </main>
      `,
    });

    expect(zenHtml).toContain('class="blog-reader is-zen"');
    expect(zenHtml).toContain("Native rhythm");
    expect(zenHtml).toContain('class="rendered-html blog-article"');
    expect(zenHtml).toContain("data-blog-zen-progress");
    expect(zenHtml).toContain('class="blog-zen-end"');
    expect(zenHtml).not.toContain("zen-toolbar");
    expect(zenHtml).not.toContain('data-blog-zen="');
    expect(zenHtml).not.toContain('class="blog-rail"');
  });

  it("projects one Blog article per Org file without requiring :blog: tags", () => {
    const document = createDocumentView([], null, [
      sectionRecord({
        body: [{ source: sourceRange(101), text: "浙江旅行正文。" }],
        effectiveTags: ["travel", "民宿"],
        level: 1,
        rangeStart: 100,
        title: "游山玩水->浙江",
      }),
      sectionRecord({
        effectiveTags: ["travel", "民宿"],
        level: 2,
        outlinePathText: ["游山玩水->浙江", "丽水站"],
        rangeStart: 120,
        title: "丽水站",
      }),
      sectionRecord({
        effectiveTags: ["gallery"],
        level: 1,
        rangeStart: 200,
        title: "Wallpaper Gallery",
      }),
    ]);

    const html = renderView({ view: "blog", document });

    expect(html).toContain("1 Org files");
    expect(html).toContain("游山玩水-&gt;浙江");
    expect(html).toContain('data-blog-article="100"');
    expect(html).toContain('data-blog-tag="travel"');
    expect(html).not.toContain('data-blog-article="120"');
    expect(html).not.toContain("Wallpaper Gallery");

    const zenHtml = renderView({
      view: "blog",
      document,
      blogArticleRangeStart: 100,
      blogZenMode: true,
      articleHtml: `
        <main>
          <h1>游山玩水-&gt;浙江</h1>
          <h2>丽水站</h2>
          <p>浙江旅行正文。</p>
          <h1>Wallpaper Gallery</h1>
        </main>
      `,
    });

    expect(zenHtml).toContain("丽水站");
    expect(zenHtml).toContain("Wallpaper Gallery");
  });

  it("filters Blog indexes by clickable topic and time thresholds", () => {
    const articles = [
      record({
        effectiveTags: ["blog", "code"],
        properties: [{ key: "DATE", value: "<2026-05-17 Sun>" }],
        rangeStart: 10,
        title: "Code article",
      }),
      record({
        effectiveTags: ["blog", "reading"],
        properties: [{ key: "DATE", value: "<2026-05-17 Sun>" }],
        rangeStart: 20,
        title: "Reading article",
      }),
      record({
        effectiveTags: ["blog", "code"],
        properties: [{ key: "DATE", value: "<2026-05-15 Fri>" }],
        rangeStart: 30,
        title: "Older code article",
      }),
    ];
    const document = createDocumentView([]);
    const blogIndex = blogIndexFixtureFromRecords(articles);

    const tagHtml = renderView({ view: "blog", document, blogIndex, blogTagFilter: "code" });
    expect(tagHtml).toContain("Code article");
    expect(tagHtml).toContain("Older code article");
    expect(tagHtml).not.toContain("Reading article");
    expect(tagHtml).toMatch(/data-blog-tag="code"[\s\S]*?data-active="true"/);

    const timeHtml = renderView({
      view: "blog",
      document,
      blogIndex,
      blogTimeFilter: "2026-05-15",
    });
    expect(timeHtml).toContain("Older code article");
    expect(timeHtml).not.toContain("Code article");
    expect(timeHtml).toContain('data-blog-time="2026-05-15"');
    expect(timeHtml).toContain('data-active="true"');
  });

  it("keeps large Blog article sets as a dated index without a rail", () => {
    const records = Array.from({ length: 20 }, (_, index) =>
      record({
        effectiveTags: ["blog"],
        properties: [
          {
            key: "DATE",
            value: `<2026-05-${String(index + 1).padStart(2, "0")} Fri>`,
          },
        ],
        rangeStart: index + 1,
        title: `Article ${index + 1}`,
      }),
    );
    const document = createDocumentView([]);
    const blogIndex = blogIndexFixtureFromRecords(records);

    const html = renderView({
      view: "blog",
      document,
      blogIndex,
      blogArticleRangeStart: 12,
      articleHtml: `
        <main>
          <h1>Article 12</h1>
          <p>Selected article body.</p>
        </main>
      `,
    });

    expect(html).toContain('class="blog-index"');
    expect(html).toContain(">20<");
    expect(html.match(/class="blog-index-article"/g) ?? []).toHaveLength(20);
    expect((html.match(/class="blog-time-threshold"/g) ?? []).length).toBeLessThanOrEqual(13);
    expect(html).not.toContain("article-switcher-summary");
    expect(html).not.toContain("blog-time-point");
    expect(html).toContain('data-blog-article="12"');
    expect(html.indexOf("Article 20")).toBeLessThan(html.indexOf("Article 1"));
  });

  it("derives a source-local range for a second WASM Agenda query", () => {
    const document = createDocumentView([
      record({
        title: "Bathroom Design",
        planning: {
          scheduled: "<2020-12-19 Sat>-<2020-12-19 Sat>",
        },
      }),
      record({
        rangeStart: 9,
        title: "Closed archive",
        planning: {
          closed: "[2019-07-27 Sat 16:32]",
        },
      }),
    ]);

    const range = sourcePlanningAgendaRange(document.agenda, {
      start: { year: 2026, month: 5, day: 15 },
      days: 7,
      end: { year: 2026, month: 5, day: 21 },
      label: "2026-05-15 - 2026-05-21",
      limit: 32,
      mode: "classic",
    });

    expect(range).toMatchObject({
      start: { year: 2019, month: 7, day: 27 },
      end: { year: 2020, month: 12, day: 19 },
      label: "2019-07-27 - 2020-12-19",
      mode: "classic",
    });
  });

  it("projects native Org syntax into explicit reading aesthetics", () => {
    const document = createDocumentView(
      [
        record({
          effectiveTags: ["blog"],
          rangeStart: 10,
          title: "Native Org surface",
        }),
      ],
      null,
      [
        sectionRecord({
          effectiveTags: ["blog", "agenda"],
          level: 1,
          planning: {
            scheduled: {
              kind: "active",
              raw: "<2026-05-16 Sat 11:00>",
              isRange: false,
              start: { year: 2026, month: 5, day: 16, dayName: "Sat", hour: 11, minute: 0 },
            },
            deadline: {
              kind: "active",
              raw: "<2026-05-18 Mon>",
              isRange: false,
              start: { year: 2026, month: 5, day: 18, dayName: "Mon" },
            },
          },
          priority: {
            raw: "[#A]",
            effective: "A",
            isDefault: false,
            rangeStatus: "inRange",
            profile: { highest: "A", lowest: "C", default: "B" },
          },
          properties: [{ key: "AREA", value: "reader", source: sourceRange(11) }],
          rangeStart: 10,
          title: "Native Org surface",
          todo: "NEXT",
          todoState: "todo",
        }),
      ],
    );

    const html = renderView({
      view: "blog",
      document,
      blogArticleRangeStart: 10,
      blogZenMode: true,
      articleHtml: `
        <main>
          <h1>Native Org surface</h1>
          <section>
            <table><thead><tr><td>Syntax family</td><td>Risk</td></tr></thead><tbody><tr><td>Planning</td><td>flat text</td></tr></tbody></table>
            <pre class="example">example block</pre>
            <pre><code class="language-typescript">type Native = true;</code></pre>
          </section>
        </main>
      `,
      sourceFile: "blog/native.org",
    });

    expect(html).toContain("org-heading-todo org-heading-todo--focus");
    expect(html).toContain(">NEXT<");
    expect(html).toContain("org-heading-priority org-priority--a");
    expect(html).toContain("[#A]");
    expect(html).toContain("org-planning-chip org-planning-chip--scheduled");
    expect(html).toContain('datetime="2026-05-16T11:00"');
    expect(html).toContain("org-planning-chip org-planning-chip--deadline");
    expect(html).toContain("org-table-frame");
    expect(html).toContain('<th scope="col">Syntax family</th>');
    expect(html).toContain("org-block-frame");
    expect(html).toContain("SRC · typescript");
    expect(html).toContain("EXAMPLE");
  });

  it("projects real travel Org cues into Google Maps links and enrich fields", () => {
    const coordinateSource = sourceRange(41);
    const document = createDocumentView([], null, [
      sectionRecord({
        effectiveTags: ["travel", "民宿"],
        level: 1,
        outlinePathText: ["游山玩水->浙江"],
        rangeStart: 13,
        title: "游山玩水->浙江",
      }),
      sectionRecord({
        body: [{ source: coordinateSource, text: "丽水站位于中国浙江省丽水市莲都区。" }],
        level: 2,
        outlinePathText: ["游山玩水->浙江", "丽水站"],
        properties: [
          {
            key: "地理坐标",
            source: coordinateSource,
            value:
              "坐标 ： 28°26′43.88″N 119°57′1.51″E / 28.4455222°N 119.9504194°E /28.4455222; 119.9504194",
          },
          {
            key: "URL",
            source: coordinateSource,
            value: "https://zh.wikipedia.org?curid=4341060",
          },
        ],
        rangeStart: 41,
        title: "丽水站",
      }),
      sectionRecord({
        body: [
          {
            source: sourceRange(55),
            text: "- [2020-11-29 Sun 20:02] -> [[id:tibet-video][西藏旅行纪录片 - YouTube]]",
          },
        ],
        effectiveTags: ["travel"],
        level: 1,
        outlinePathText: ["游山玩水->西藏"],
        rangeStart: 55,
        title: "游山玩水->西藏",
      }),
      sectionRecord({
        body: [
          {
            source: sourceRange(62),
            text: "- [2020-11-30 Mon 22:24] -> [[id:erhai][洱海]]",
          },
        ],
        effectiveTags: ["旅馆"],
        links: [{ path: "id:erhai", description: "洱海", source: sourceRange(62) }],
        level: 2,
        outlinePathText: ["游山玩水->云南", "民宿｜200 戶人的島上"],
        rangeStart: 62,
        title: "民宿｜200 戶人的島上",
      }),
    ]);

    const travel = createTravelView(document, "blog/travel.org");
    const lishui = travel.places.find((place) => place.title === "丽水站");
    const tibet = travel.places.find((place) => place.title === "游山玩水->西藏");
    const erhai = travel.places.find((place) => place.title === "民宿｜200 戶人的島上");

    expect(travel.regions).toEqual(["浙江", "西藏", "云南"]);
    expect(lishui?.coordinates).toMatchObject({ lat: 28.4455222, lon: 119.9504194 });
    expect(lishui?.googleMapsUrl).toBe(buildGoogleMapsSearchUrl("28.4455222,119.9504194"));
    expect(lishui?.googleMapsEmbedUrl).toBe(buildGoogleMapsEmbedUrl("28.4455222,119.9504194"));
    expect(tibet?.query).toBe("西藏");
    expect(erhai?.query).toBe("洱海 云南");
    expect(erhai?.enrichFields).toContain("GEO_LAT");

    const html = renderView({
      view: "travel",
      document,
      articleHtml: `
        <main>
          <h1>游山玩水-&gt;云南</h1>
          <section>
            <p>云南 region intro.</p>
          </section>
          <h2>民宿｜200 戶人的島上</h2>
          <section>
            <div class="videoWrapper mb-4">
              <iframe src="https://www.youtube.com/embed/CIZZiV7knVM"></iframe>
              <iframe src="https://evil.example/embed/CIZZiV7knVM"></iframe>
            </div>
          </section>
        </main>
      `,
      sourceFile: "blog/travel.org",
    });
    expect(html).toContain("data-travel-card");
    expect(html).toContain("travel-tags");
    expect(html).toContain("org-meta-tag");
    expect(html).toContain("data-travel-map-toggle");
    expect(html).toContain("data-travel-glance-template");
    expect(html).toContain("travel-glance-flow");
    expect(html).toContain("travel-media-flow");
    expect(html).toContain("travel-glance-flow-item");
    expect(html).toContain("travel-glance-flow-item--full");
    const mediaIndex = html.indexOf("travel-media-flow");
    expect(html.indexOf("travel-glance-facts")).toBeLessThan(mediaIndex);
    expect(mediaIndex).toBeLessThan(html.indexOf("travel-inline-map--glance", mediaIndex));
    expect(html).toContain('src="https://www.youtube.com/embed/CIZZiV7knVM"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation"');
    expect((html.match(/youtube\.com\/embed\/CIZZiV7knVM/g) ?? []).length).toBe(1);
    expect(html).not.toContain("evil.example");
    expect(html).toContain("maps.google.com/maps");
    expect(html).not.toContain("Open in Google Maps");
    expect(html).toContain("丽水站");
    expect(html).toContain("28.4455222, 119.9504194");
    expect(html).toContain("GOOGLE_PLACE_ID");
  });

  it("uses parser-owned travel structure instead of a hard-coded category tag allowlist", () => {
    const document = createDocumentView([], null, [
      sectionRecord({
        effectiveTags: ["美食"],
        level: 1,
        rangeStart: 10,
        title: "普通美食摘录",
      }),
      sectionRecord({
        effectiveTags: [],
        level: 2,
        links: [{ path: "id:lishui-station", description: "丽水站", source: sourceRange(20) }],
        outlinePathText: ["游山玩水->浙江", "丽水站"],
        rangeStart: 20,
        title: "丽水站",
      }),
    ]);

    const travel = createTravelView(document, "blog/notes.org");

    expect(travel.places.map((place) => place.title)).toEqual(["丽水站"]);
    expect(travel.places[0]?.query).toBe("丽水站 浙江");
    expect(travel.places[0]?.kind).toBe("place");
  });

  it("keeps small static Travel projections off the TanStack virtual scroll path", () => {
    const records = Array.from({ length: 22 }, (_, index) =>
      sectionRecord({
        level: 2,
        outlinePathText: ["游山玩水->浙江", `Place ${index + 1}`],
        rangeStart: index + 1,
        title: `Place ${index + 1}`,
      }),
    );
    const travelView = createTravelViewFromSources([
      {
        records,
        sourceFile: "blog/travel.org",
        sourceName: "Travel",
      },
    ]);

    const html = renderView({ view: "travel", document: null, travelView });

    expect(travelView.places).toHaveLength(22);
    expect(html).toContain("22 Org headings projected from 1 source files");
    expect(html).not.toContain("data-travel-virtual-list");
    expect(html).toContain("data-travel-card");
  });

  it("renders site-wide Travel from section records without waiting for the active document", () => {
    const travelView = createTravelViewFromSources([
      {
        records: [
          sectionRecord({
            effectiveTags: ["travel"],
            level: 1,
            outlinePathText: ["游山玩水->浙江"],
            rangeStart: 13,
            title: "游山玩水->浙江",
          }),
        ],
        sourceFile: "blog/travel.org",
        sourceName: "Travel",
      },
    ]);

    const html = renderView({
      view: "travel",
      document: null,
      pendingMessage: "Loading Org source...",
      travelView,
    });

    expect(html).toContain("游山玩水-&gt;浙江");
    expect(html).toContain("1 Org headings projected from 1 source files");
    expect(html).not.toContain("Loading Org source");
  });

  it("renders Notes through the shared Org HTML record renderer", () => {
    const document = createDocumentView(
      [
        record({
          bodyPreview: "Plain preview should not be primary",
          effectiveTags: ["record"],
          outline: "Environments / [[https://example.com/wallpaper][Wallpaper]]",
          rangeStart: 42,
          title: "[[https://example.com/wallpaper][Wallpaper]]",
        }),
      ],
      null,
      [
        sectionRecord({
          outlinePath: ["Environments", "[[https://example.com/wallpaper][Wallpaper]]"],
          outlinePathText: ["Environments", "Wallpaper"],
          rangeStart: 42,
          title: "[[https://example.com/wallpaper][Wallpaper]]",
        }),
      ],
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
    expect(html).toContain("1 explicit :record: heading from Org source");
    expect(html).toContain("Environments / Wallpaper");
    expect(html).toContain("Rendered paragraph");
    expect(html).toContain("org-block-frame");
    expect(html).toContain("org-native-block");
    expect(html).not.toContain("[[https://example.com/wallpaper");
    expect(html).not.toContain("Plain preview should not be primary");
  });

  it("keeps source metadata out of Notes cards when the exporter omits Org keyword lines", () => {
    const source = sourceRange(99);
    const document = createDocumentView(
      [
        record({
          bodyPreview: "Plain preview should not be primary",
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
    expect(html).not.toContain("Source metadata");
    expect(html).not.toContain("Downloaded");
    expect(html).not.toContain("https://example.com/original.jpg");
    expect(html).not.toContain("#+DOWNLOADED");
    expect(html).not.toContain("Plain preview should not be primary");
  });

  it("preserves HTML export embeds through an iframe allowlist", () => {
    const template = document.createElement("template");
    template.innerHTML = `
      <div class="videoWrapper mb-4">
        <iframe src="https://www.youtube.com/embed/vb1-lHR7kRM" width="653" height="367"></iframe>
        <iframe src="https://maps.google.com/maps?q=%E4%B8%BD%E6%B0%B4&output=embed"></iframe>
        <iframe src="https://evil.example/embed/vb1-lHR7kRM"></iframe>
      </div>
    `;

    applyHtmlEmbedPolicy(template.content);
    const html = Array.from(template.content.children)
      .map((element) => element.outerHTML)
      .join("");

    expect(html).toContain("videoWrapper mb-4");
    expect(html).toContain('src="https://www.youtube.com/embed/vb1-lHR7kRM"');
    expect(html).toContain(
      'src="https://maps.google.com/maps?q=%E4%B8%BD%E6%B0%B4&amp;output=embed"',
    );
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation"');
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(html).toContain('title="YouTube video"');
    expect(html).toContain('title="Google Maps preview"');
    expect(html).not.toContain("evil.example");
  });

  it("applies the iframe allowlist while rendering record HTML", () => {
    const document = createDocumentView(
      [
        record({
          effectiveTags: ["record"],
          rangeStart: 42,
          title: "Video note",
        }),
      ],
      null,
      [
        sectionRecord({
          rangeStart: 42,
          title: "Video note",
        }),
      ],
    );

    const html = renderView({
      view: "records",
      document,
      articleHtml: `
        <main>
          <h2>Video note</h2>
          <iframe src="about:blank#not-whitelisted"></iframe>
        </main>
      `,
    });

    expect(html).not.toContain("about:blank#not-whitelisted");
  });

  it("surfaces a missing HTML projection instead of rendering raw source content", () => {
    const source = sourceRange(123);
    const document = createDocumentView(
      [
        record({
          bodyPreview: "Plain preview should not be primary",
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

    expect(html).toContain("org-record-render--missing");
    expect(html).toContain("HTML projection missing for this Org section.");
    expect(html).toContain("meta-row org-meta-row");
    expect(html).toContain("org-meta-row--tags");
    expect(html).toContain("org-meta-tag");
    expect(html).not.toContain("Source-only body from semantic section.");
    expect(html).not.toContain("Plain preview should not be primary");
  });

  it("renders Memory records through the same Org HTML record renderer", () => {
    const source = sourceRange(84);
    const rawTitle = "[[https://example.com/memory][Memory heading]]";
    const document = withAgentMemory(
      createDocumentView(
        [
          record({
            bodyPreview: "Plain memory preview",
            effectiveTags: ["memory"],
            rangeStart: 84,
            title: rawTitle,
          }),
        ],
        null,
        [
          sectionRecord({
            outlinePath: ["Workspace", rawTitle],
            outlinePathText: ["Workspace", "Memory heading"],
            rangeStart: 84,
            title: rawTitle,
          }),
        ],
      ),
      createAgentMemoryView(
        memoryResponse({
          source,
          title: rawTitle,
          cards: [
            {
              source,
              decision: {
                code: "MEM-R001",
                kind: "current",
                severity: "info",
                title: "Render as semantic HTML",
                nextAction: "Keep unified projection in use.",
              },
              authority: [],
              title: rawTitle,
              todo: "NEXT",
              todoState: "todo",
              tags: ["memory"],
              effectiveTags: ["memory"],
              anchor: null,
              evidence: [],
              links: [],
            },
          ],
        }),
      ),
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
    expect(html).toContain("memory-tags");
    expect(html).toContain("org-heading-todo org-heading-todo--focus");
    expect(html).toContain("org-meta-tag");
    expect(html).toContain("Rendered memory paragraph");
    expect(html).toContain("Memory heading");
    expect(html).not.toContain("[[https://example.com/memory");
    expect(html).not.toContain("Plain memory preview");
  });

  it("does not render raw Org content when a Memory section is missing from HTML", () => {
    const source = sourceRange(88);
    const document = withAgentMemory(
      createDocumentView(
        [
          record({
            bodyPreview: "Raw memory preview",
            effectiveTags: ["memory"],
            rangeStart: 88,
            title: "Missing Memory HTML",
          }),
        ],
        null,
        [
          sectionRecord({
            body: [
              {
                source,
                text: [
                  "#+DOWNLOADED: https://example.com/raw.jpg",
                  "[[https://example.com/raw][raw link]]",
                  "[[attachment:raw.jpg]]",
                ].join("\n"),
              },
            ],
            rangeStart: 88,
            title: "Missing Memory HTML",
          }),
        ],
      ),
      createAgentMemoryView(memoryResponse({ source, title: "Missing Memory HTML" })),
    );

    const html = renderView({
      view: "memory",
      document,
      articleHtml: "<main><h2>Different memory heading</h2></main>",
    });

    expect(html).toContain("org-record-render--missing");
    expect(html).not.toContain("#+DOWNLOADED");
    expect(html).not.toContain("[[https://example.com/raw");
    expect(html).not.toContain("[[attachment:raw.jpg]]");
    expect(html).not.toContain("Raw memory preview");
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

    const agenda = {
      start: { year: 2026, month: 5, day: 15 },
      days: 7,
      end: { year: 2026, month: 5, day: 21 },
      label: "2026-05-15 to 2026-05-21",
      limit: 32,
      mode: "classic",
    } as const;
    const leanStaticSource = structuredClone(staticSource);
    delete leanStaticSource.memory;
    delete leanStaticSource.sectionIndex;

    const leanDocument = documentViewFromStaticSource(leanStaticSource, agenda);
    expect(leanDocument.agentMemory).toBeNull();
    expect(leanDocument.semanticSections).toHaveLength(0);

    const document = documentViewFromStaticSource(
      leanStaticSource,
      agenda,
      staticSource.memory,
      staticSource.sectionIndex,
    );

    expect(document.counts.attachments).toBe(1);
    expect(document.counts.memory).toBe(1);
    expect(document.agentMemory?.response.stats.totalRecords).toBe(1);
    expect(document.semanticSections).toHaveLength(1);
    expect(document.lint).toEqual([]);
    expect(renderView({ view: "gallery", document })).toContain("1 image items");
    expect(
      renderView({
        view: "records",
        document,
        articleHtml: staticSource.html,
      }),
    ).toContain("Static rendered body");
  });

  it("keeps unavailable public image links out of the site gallery", () => {
    const available = staticProjection();
    const unavailable = staticProjection();
    unavailable.id = "missing-image";
    unavailable.name = "Missing Image Source";
    unavailable.sourceFile = "blog/missing-image.org";
    unavailable.attachmentInventory.display[0] = {
      ...unavailable.attachmentInventory.display[0],
      publicExists: false,
    } as (typeof unavailable.attachmentInventory.display)[number] & { publicExists: boolean };

    const gallery = attachmentGalleryFromSources([available, unavailable]);

    expect(gallery.records).toHaveLength(1);
    expect(gallery.entryCount).toBe(2);
    expect(gallery.records[0]?.sourceName).toBe("Wallpaper Attachment Gallery");
  });
});

const blogIndexFixtureFromRecords = (records: ReturnType<typeof record>[]) => {
  const articles = records
    .map((article, index) => ({
      ...article,
      file: `article-${index + 1}.org`,
      sourceFile: `blog/article-${index + 1}.org`,
      sourceId: `article-${index + 1}`,
      sourceName: `Article ${index + 1}`,
    }))
    .sort((left, right) => blogFixtureDateRank(right) - blogFixtureDateRank(left));
  return {
    articleCount: articles.length,
    articles,
    dateRange: null,
    siteWide: true as const,
    sourceCount: articles.length,
    tagFacets: tagFacetsFor(articles),
  };
};

const tagFacetsFor = (articles: Array<{ effectiveTags: string[] }>) =>
  [
    ...articles.reduce((counts, article) => {
      for (const tag of article.effectiveTags) {
        if (tag.toLowerCase() !== "blog") {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
      return counts;
    }, new Map<string, number>()),
  ].map(([tag, count]) => ({ count, tag }));

const blogFixtureDateRank = (article: { properties: Array<{ key: string; value: string }> }) => {
  const value = article.properties.find((property) => property.key === "DATE")?.value ?? "";
  const match = /(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? Date.parse(`${match[1]}T00:00:00Z`) : 0;
};
