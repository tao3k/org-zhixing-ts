import { readFileSync } from "node:fs";
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
