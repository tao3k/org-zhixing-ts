import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { renderView } from "../src/render";
import type { StaticSiteData, StaticSourceProjection } from "../src/staticSiteData";
import { travelViewFromStaticSite } from "../src/travelSiteProjection";
import { createTravelViewFromSources } from "../src/travelModel";
import { sectionRecord } from "./modelFixtures";
import { staticProjection } from "./staticProjection.fixture";

describe("Org Zhixing performance regression gates", () => {
  it("keeps real Travel scale on the plain static render path", () => {
    const travelView = createTravelViewFromSources([
      {
        records: travelRecords(22),
        sourceFile: "blog/travel.org",
        sourceName: "Travel",
      },
    ]);

    const result = sample("renderTravel22", () =>
      renderView({ view: "travel", document: null, travelView }),
    );

    expect(result.lastValue).toContain("22 Org headings projected from 1 source files");
    expect(result.lastValue).toContain("data-travel-card");
    expect(result.lastValue).not.toContain("data-travel-virtual-list");
    expect(result.p95Ms).toBeLessThan(30);
  });

  it("caches source-derived static Travel projections when manifest travel is absent", () => {
    const staticSite = staticSiteWithTravelRecords({ sources: 8, recordsPerSource: 100 });
    const first = travelViewFromStaticSite(staticSite);
    const second = travelViewFromStaticSite(staticSite);
    const cached = sample("cachedTravelProjection", () => travelViewFromStaticSite(staticSite), 50);

    expect(first.places).toHaveLength(800);
    expect(second).toBe(first);
    expect(cached.lastValue).toBe(first);
    expect(cached.p95Ms).toBeLessThan(2);
  });

  it("keeps heavy Travel virtualization behind an explicit lazy boundary", () => {
    const appEvents = readFileSync("src/appEvents.ts", "utf8");
    const travelRender = readFileSync("src/travelRender.ts", "utf8");

    expect(appEvents).not.toMatch(/import\s+\{?\s*bindTravelVirtualList/);
    expect(appEvents).toContain('import("./travelVirtualList")');
    expect(appEvents).toContain('querySelector("[data-travel-virtual-list]")');
    expect(travelRender).toContain("const virtualListThreshold = 80;");
    expect(travelRender).toContain("travel.places.length >= virtualListThreshold");
  });

  it("keeps heavy Blog indexing behind an explicit lazy boundary", () => {
    const appEvents = readFileSync("src/appEvents.ts", "utf8");
    const blogRender = readFileSync("src/blogRender.ts", "utf8");
    const perfScript = readFileSync("scripts/bench-org-zhixing-ui.mjs", "utf8");

    expect(appEvents).not.toMatch(/import\s+\{?\s*bindBlogVirtualList/);
    expect(appEvents).toContain('import("./blogVirtualList")');
    expect(appEvents).toContain('querySelector("[data-blog-virtual-list]")');
    expect(blogRender).toContain("export const blogVirtualListThreshold = 120;");
    expect(blogRender).toContain("articles.length >= blogVirtualListThreshold");
    expect(perfScript).toContain("eagerBlogVirtualList: false");
    expect(perfScript).toContain("dynamicBlogVirtualListChunk");
  });

  it("keeps parser runtime and source shards off static site-wide startup", () => {
    const app = readFileSync("src/app.ts", "utf8");
    const orgizeClient = readFileSync("src/orgizeClient.ts", "utf8");
    const perfScript = readFileSync("scripts/bench-org-zhixing-ui.mjs", "utf8");

    expect(orgizeClient).not.toContain("this.#worker = options.createWorker();");
    expect(orgizeClient).toContain("#workerForRequest()");
    expect(app).toContain("#viewNeedsActiveSource()");
    expect(app).toContain("#canRenderStaticSiteWideView()");
    expect(perfScript).toContain("lazyParserWorker: true");
    expect(perfScript).toContain("staticSiteWideSourceDeferral: true");
  });

  it("keeps static Blog generation on one article per discovered Org file", () => {
    const generator = readFileSync("scripts/generate-static-site.mjs", "utf8");

    expect(generator).toContain("sources.map(blogArticleFromSource)");
    expect(generator).toContain("org.metadataJson()");
    expect(generator).toContain("const title = blogArticleTitle(source);");
    expect(generator).not.toContain("title: source.name");
    expect(generator).not.toContain("source.sectionIndex.records.map");
    expect(generator).not.toContain(
      'record.effectiveTags.some((tag) => tag.toLowerCase() === "blog")',
    );
  });

  it("projects Blog article display titles from Org #+TITLE metadata", () => {
    execFileSync("node", ["scripts/generate-static-site.mjs"], { stdio: "pipe" });
    const manifest = JSON.parse(
      readFileSync(".cache/org-zhixing/static-site.json", "utf8"),
    ) as StaticSiteData;
    const sourceTitles = new Map(
      manifest.sources.map((source) => [source.sourceFile, source.orgTitle ?? source.name]),
    );
    const travelArticle = manifest.blog?.articles.find(
      (article) => article.sourceFile === "blog/travel.org",
    );

    expect(manifest.blog?.articleCount).toBe(manifest.sources.length);
    for (const article of manifest.blog?.articles ?? []) {
      expect(article.title).toBe(sourceTitles.get(article.sourceFile));
      expect(article.sourceName).toBe(article.title);
    }
    expect(travelArticle?.title).toBe("游山玩水");
    expect(travelArticle?.sourceName).toBe("游山玩水");
    expect(manifest.blog?.articles.map((article) => article.title)).toContain("Org Syntax Atlas");
  });

  it("keeps Zen reader progress as a lazy reading affordance", () => {
    const appEvents = readFileSync("src/appEvents.ts", "utf8");
    const blogZenProgress = readFileSync("src/blogZenProgress.ts", "utf8");

    expect(appEvents).not.toMatch(/import\s+\{?\s*bindBlogZenProgress/);
    expect(appEvents).toContain('import("./blogZenProgress")');
    expect(appEvents).toContain('querySelector("[data-blog-zen-progress]")');
    expect(blogZenProgress).toContain("readingProgressPercent");
    expect(blogZenProgress).not.toContain("@mozilla/readability");
  });

  it("keeps Travel Zen Glance window and masonry runtimes behind lazy boundaries", () => {
    const appEvents = readFileSync("src/appEvents.ts", "utf8");
    const travelGlance = readFileSync("src/travelGlance.ts", "utf8");
    const perfScript = readFileSync("scripts/bench-org-zhixing-ui.mjs", "utf8");

    expect(appEvents).toContain('import("./travelVirtualList")');
    expect(appEvents).not.toContain("masonry-layout");
    expect(appEvents).not.toContain("@zag-js/floating-panel");
    expect(travelGlance).not.toMatch(/import\s+\{?\s*machine/);
    expect(travelGlance).not.toContain("@zag-js/dialog");
    expect(travelGlance).toContain('import("@zag-js/floating-panel")');
    expect(travelGlance).not.toMatch(/import\s+Masonry/);
    expect(travelGlance).toContain('import("masonry-layout")');
    expect(travelGlance).toContain('itemSelector: ".travel-glance-flow-item"');
    expect(travelGlance).not.toContain('flow.dataset.layout = "single"');
    expect(perfScript).toContain("eagerFloatingPanel: false");
    expect(perfScript).toContain("dynamicFloatingPanelChunk");
  });

  it("keeps the styled source picker runtime behind a lazy boundary", () => {
    const appUi = readFileSync("src/appUi.ts", "utf8");
    const sourcePicker = readFileSync("src/sourcePicker.ts", "utf8");
    const perfScript = readFileSync("scripts/bench-org-zhixing-ui.mjs", "utf8");

    expect(appUi).not.toContain("@zag-js/select");
    expect(sourcePicker).not.toMatch(/^import\s+\{[^}]*\}\s+from "@zag-js\/select"/m);
    expect(sourcePicker).toContain('import("@zag-js/select")');
    expect(perfScript).toContain("eagerZagSelect: false");
    expect(perfScript).toContain("dynamicZagSelectChunk");
  });

  it("keeps attachment lightbox code behind an image-opener lazy boundary", () => {
    const appEvents = readFileSync("src/appEvents.ts", "utf8");

    expect(appEvents).not.toMatch(/import\s+\{?\s*bindAttachmentGalleryViewer/);
    expect(appEvents).toContain('import("./attachmentGalleryViewer")');
    expect(appEvents).toContain('a[data-attachment-open][data-attachment-kind="image"]');
  });

  it("keeps link soft wrapping free of the heavyweight CSS line-break runtime", () => {
    const typographicText = readFileSync("src/typographicText.ts", "utf8");

    expect(typographicText).not.toContain("css-line-break");
    expect(typographicText).toContain("Intl");
    expect(typographicText).toContain("<wbr>");
  });
});

type SampleResult<T> = {
  lastValue: T;
  name: string;
  p50Ms: number;
  p95Ms: number;
};

const sample = <T>(name: string, fn: () => T, iterations = 30): SampleResult<T> => {
  let lastValue = fn();
  const values: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    lastValue = fn();
    values.push(performance.now() - startedAt);
  }
  values.sort((left, right) => left - right);
  return {
    lastValue,
    name,
    p50Ms: round(percentile(values, 0.5)),
    p95Ms: round(percentile(values, 0.95)),
  };
};

const staticSiteWithTravelRecords = ({
  sources,
  recordsPerSource,
}: {
  sources: number;
  recordsPerSource: number;
}): StaticSiteData => ({
  schemaVersion: 1,
  generatedAt: "2026-05-21T00:00:00.000Z",
  configPath: "org-zhixing.toml",
  orgize: { buildTime: "test", gitHash: "test" },
  sources: Array.from({ length: sources }, (_, index) =>
    staticSourceWithTravelRecords(index + 1, recordsPerSource),
  ),
});

const staticSourceWithTravelRecords = (
  sourceIndex: number,
  recordsPerSource: number,
): StaticSourceProjection => {
  const projection = structuredClone(staticProjection());
  projection.id = `travel-${sourceIndex}`;
  projection.name = `Travel ${sourceIndex}`;
  projection.file = `travel-${sourceIndex}.org`;
  projection.sourceFile = `blog/travel-${sourceIndex}.org`;
  projection.sectionIndex.records = travelRecords(recordsPerSource, sourceIndex * 10_000);
  return projection;
};

const travelRecords = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) =>
    sectionRecord({
      level: 2,
      outlinePathText: [`游山玩水->Region ${Math.floor(index / 10) + 1}`, `Place ${index + 1}`],
      rangeStart: offset + index + 1,
      title: `Place ${index + 1}`,
    }),
  );

const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const index = Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1);
  return values[index] ?? 0;
};

const round = (value: number): number => Math.round(value * 100) / 100;
