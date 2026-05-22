import { afterEach, describe, expect, it, vi } from "vitest";
import { mountOrgZhixingApp } from "../src/app";
import { attachmentGalleryFromSources } from "../src/attachmentGalleryModel";
import type { StaticSiteData, StaticSourceProjection } from "../src/staticSiteData";
import { sectionRecord, sourceRange } from "./modelFixtures";
import { staticProjection } from "./staticProjection.fixture";

vi.mock("photoswipe/lightbox", () => ({
  default: class {
    addFilter(): void {}
    destroy(): void {}
    init(): void {}
  },
}));

const configText = `
[site]
title = "知行合一"
locale = "zh-CN"

[content]
content_dir = "blog"

[ui]
default_view = "gallery"
show_timings = true

[[ui.views]]
id = "blog"
label = "Blog"
weight = 10

[[ui.views]]
id = "gallery"
label = "Gallery"
weight = 18

[[ui.views]]
id = "records"
label = "Notes"
weight = 20

[[ui.views]]
id = "memory"
label = "Memory"
weight = 25

[[ui.views]]
id = "travel"
label = "Travel"
weight = 28

[[ui.views]]
id = "agenda"
label = "Agenda"
weight = 30

[behavior]
lazy_lint = true

[attachments]
attach_id_dir = ".attach"
check_vcs = false
check_annex = false
scan_orphans = false

[agenda]
start = "2026-05-15"
days = 7
limit = 32
mode = "classic"
`;

describe("Org Zhixing navigator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("keeps Gallery, Notes, and Memory populated from the static manifest", async () => {
    mountStaticApp();

    await waitForText("2 image items");
    expect(view()).toBe("gallery");
    expect(statusText()).toContain("static");
    expect(document.querySelectorAll(".attachment-card")).toHaveLength(2);
    expect(document.body.textContent).toContain("across 3 Org sources");
    expect(document.body.textContent).toContain("from 3 semantic attachment records");
    expect(document.body.textContent).toContain("Wallpaper Attachment Gallery / Static Gallery");
    expect(document.body.textContent).toContain("Demo Source / Static Gallery");
    expect(document.body.textContent).not.toContain("demo.pdf");

    clickNav("records");
    await waitForView("records");
    await waitForText("2 indexed notes from 2 Org sources");
    expect(new URL(window.location.href).searchParams.get("view")).toBe("records");
    expect(new URL(window.location.href).searchParams.get("source")).toBeNull();
    expect(document.querySelectorAll(".org-record-render")).toHaveLength(2);
    expect(document.body.textContent).toContain(":record:");
    expect(document.body.textContent).toContain(":ATTACH:");
    expect(document.body.textContent).toContain("Static rendered body");
    expect(document.body.textContent).toContain("Demo rendered body");
    expect(document.body.textContent).toContain("Environments / Static Gallery");
    expect(document.body.textContent).not.toContain("Source metadata");
    expect(document.body.textContent).not.toContain("Downloaded");
    expect(document.body.textContent).not.toContain("https://example.com/static.jpg");
    expect(document.body.textContent).not.toContain("[[https://example.com/static-gallery");
    expect(document.body.textContent).not.toContain("#+DOWNLOADED");
    expect(document.body.textContent).not.toContain("No notes records found");

    clickNav("memory");
    await waitForView("memory");
    expect(new URL(window.location.href).searchParams.get("view")).toBe("memory");
    expect(new URL(window.location.href).searchParams.get("source")).toBeNull();
    expect(document.querySelectorAll(".memory-record")).toHaveLength(1);
    expect(document.querySelectorAll(".org-record-render--memory")).toHaveLength(1);
    expect(document.body.textContent).not.toContain("No memory records in this source");

    clickNav("travel");
    await waitForView("travel");
    expect(new URL(window.location.href).searchParams.get("view")).toBe("travel");
    expect(new URL(window.location.href).searchParams.get("source")).toBeNull();
    expect(document.body.textContent).toContain("Travel Demo");
    expect(document.body.textContent).toContain("2 Org headings projected from 1 source files");
    expect(document.body.textContent).not.toContain("No travel places");

    clickNav("gallery");
    await waitForView("gallery");
    expect(document.querySelectorAll(".attachment-card")).toHaveLength(2);
    expect(document.body.textContent).toContain("2 image items");

    clickNav("agenda");
    await waitForView("agenda");
    expect(new URL(window.location.href).searchParams.get("view")).toBe("agenda");
    expect(new URL(window.location.href).searchParams.get("source")).toBeNull();
    expect(document.body.textContent).toContain("Compiled sections");
    expect(document.body.textContent).toContain("Static Gallery");
    expect(document.body.textContent).toContain("SCHEDULED");
    expect(document.body.textContent).toContain("<2020-12-19 Sat>-<2020-12-19 Sat>");
    expect(document.body.textContent).toContain("WASM agenda projection");
    expect(document.body.textContent).not.toContain("[[https://example.com/static-gallery");
    expect(document.body.textContent).not.toContain("source planning");
  });

  it("switches source navigator entries without reusing stale view cache", async () => {
    mountStaticApp();

    await waitForText("Wallpaper Attachment Gallery");
    sourceButton("demo").click();

    await waitForText("Demo Source");
    const url = new URL(window.location.href);
    expect(url.searchParams.get("source")).toBeNull();
    expect(url.searchParams.get("view")).toBe("gallery");
    expect(document.querySelector("#active-source-title")?.textContent).toBe("Demo Source");
    expect(document.querySelector(".attachment-gallery-header")?.textContent).toContain(
      "across 3 Org sources",
    );
    expect(document.querySelectorAll(".attachment-card")).toHaveLength(2);
    expect(document.body.textContent).toContain("Wallpaper Attachment Gallery / Static Gallery");

    clickNav("records");
    await waitForText("Demo rendered body");
    expect(document.body.textContent).toContain("Static rendered body");
    expect(document.body.textContent).toContain("2 indexed notes from 2 Org sources");
  });

  it("uses legacy source query only as boot input and keeps navigation URLs source-free", async () => {
    mountStaticApp("/?source=org-zhixing-demo.org");

    await vi.waitFor(() =>
      expect(document.querySelector("#active-source-title")?.textContent).toBe("Demo Source"),
    );
    expect(new URL(window.location.href).searchParams.get("source")).toBeNull();

    clickNav("travel");
    await waitForView("travel");
    const url = new URL(window.location.href);
    expect(url.searchParams.get("view")).toBe("travel");
    expect(url.searchParams.get("source")).toBeNull();
    expect(document.body.textContent).toContain("Travel Demo");
  });

  it("loads source shards on demand while keeping site-wide Gallery and Records stable", async () => {
    const fetch = vi.fn(fetchShardedStaticFixture());
    mountStaticApp("/", fetch);

    await waitForText("2 image items");
    await vi.waitFor(() => expect(statusText()).toContain("static"));
    expect(document.body.textContent).toContain("across 3 Org sources");
    expect(fetchedPaths(fetch)).toContain("/org-zhixing.static.json");
    expect(fetchedPaths(fetch)).toContain("/org-zhixing.sources/wallpaper-gallery.json");

    clickNav("records");
    await waitForText("2 indexed notes from 2 Org sources");
    expect(document.body.textContent).toContain("Static rendered body");
    expect(document.body.textContent).toContain("Demo rendered body");
    expect(fetchedPaths(fetch)).toEqual(
      expect.arrayContaining([
        "/org-zhixing.sources/wallpaper-gallery.json",
        "/org-zhixing.sources/demo.json",
        "/org-zhixing.sources/travel.json",
      ]),
    );
  });
});

const mountStaticApp = (path = "/", fetch = fetchStaticFixture()) => {
  window.history.replaceState(null, "", path);
  vi.stubGlobal("fetch", fetch);
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);
  return mountOrgZhixingApp(root, { createWorker: () => new FakeWorker() as unknown as Worker });
};

const fetchStaticFixture = () => {
  const staticSite = staticSiteFixture();
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = input instanceof URL ? input : new URL(String(input), window.location.href);
    if (url.pathname.endsWith("/org-zhixing.toml")) {
      return textResponse(configText);
    }
    if (url.pathname.endsWith("/org-zhixing.static.json")) {
      return jsonResponse(staticSite);
    }
    return new Response("not found", { status: 404 });
  });
};

const fetchShardedStaticFixture = () => {
  const sources = [staticProjection(), demoProjection(), travelProjection()];
  const staticSite = shardedStaticSiteFixture(sources);
  const shards = new Map(
    sources.map((source) => [`/org-zhixing.sources/${source.id}.json`, source]),
  );
  return async (input: RequestInfo | URL) => {
    const url = input instanceof URL ? input : new URL(String(input), window.location.href);
    if (url.pathname.endsWith("/org-zhixing.toml")) {
      return textResponse(configText);
    }
    if (url.pathname.endsWith("/org-zhixing.static.json")) {
      return jsonResponse(staticSite);
    }
    const shard = shards.get(url.pathname);
    if (shard) {
      return jsonResponse(shard);
    }
    return new Response("not found", { status: 404 });
  };
};

const staticSiteFixture = (): StaticSiteData => ({
  schemaVersion: 1,
  generatedAt: "2026-05-20T00:00:00.000Z",
  configPath: "org-zhixing.toml",
  orgize: { buildTime: "test", gitHash: "test" },
  sources: [staticProjection(), demoProjection(), travelProjection()],
});

const shardedStaticSiteFixture = (sources: StaticSourceProjection[]): StaticSiteData => ({
  schemaVersion: 1,
  generatedAt: "2026-05-20T00:00:00.000Z",
  configPath: "org-zhixing.toml",
  orgize: { buildTime: "test", gitHash: "test" },
  attachmentGallery: attachmentGalleryFromSources(sources),
  travel: {
    places: [],
    regions: [],
    scannedSourceCount: sources.length,
    sourceCount: 0,
    locatedCount: 0,
    enrichCandidateCount: 0,
    siteWide: true,
  },
  sources: sources.map((source) => ({
    id: source.id,
    name: source.name,
    file: source.file,
    sourceFile: source.sourceFile,
    sourceBytes: source.sourceBytes,
    shardPath: `org-zhixing.sources/${source.id}.json`,
  })),
});

const travelProjection = (): StaticSourceProjection => {
  const projection = structuredClone(staticProjection());
  const source = sourceRange(900);
  projection.id = "travel";
  projection.name = "Travel Demo";
  projection.file = "travel.org";
  projection.sourceFile = "blog/travel.org";
  projection.sourceBytes = 256;
  projection.html = "<main><h1>Travel Demo</h1></main>";
  projection.viewIndex.records = [];
  projection.sectionIndex.records = [
    sectionRecord({
      effectiveTags: ["travel"],
      level: 1,
      outlinePathText: ["游山玩水->浙江"],
      rangeStart: 900,
      title: "游山玩水->浙江",
    }),
    sectionRecord({
      body: [{ source, text: "丽水站" }],
      level: 2,
      outlinePathText: ["游山玩水->浙江", "丽水站"],
      properties: [
        { key: "GEO_LAT", source, value: "28.4455222" },
        { key: "GEO_LON", source, value: "119.9504194" },
      ],
      rangeStart: 920,
      title: "丽水站",
    }),
  ];
  projection.attachmentInventory.entries = [];
  projection.attachmentInventory.display = [];
  projection.agendaView.cards = [];
  projection.agendaView.totalCandidates = 0;
  projection.memory.stats.totalRecords = 0;
  projection.memory.stats.currentRecords = 0;
  projection.memory.records = [];
  return projection;
};

const demoProjection = (): StaticSourceProjection => {
  const projection = structuredClone(staticProjection());
  projection.id = "demo";
  projection.name = "Demo Source";
  projection.file = "org-zhixing-demo.org";
  projection.sourceFile = "blog/org-zhixing-demo.org";
  projection.html = "<main><h1>Demo Source</h1><p>Demo rendered body</p></main>";
  projection.viewIndex.records[0].title = "Demo Source";
  projection.sectionIndex.records[0].title = "Demo Source";
  projection.sectionIndex.records[0].titleText = "Demo Source";
  projection.sectionIndex.records[0].outlinePath = ["Demo Source"];
  projection.sectionIndex.records[0].outlinePathText = ["Demo Source"];
  projection.attachmentInventory.entries[0].sectionTitle = "Demo Source";
  projection.attachmentInventory.display[0].sectionTitle = "Demo Source";
  projection.attachmentInventory.display[0].sectionTitleText = "Demo Source";
  projection.attachmentInventory.entries.push({
    ...projection.attachmentInventory.entries[0],
    path: "demo.pdf",
    absolutePath: "/tmp/demo.pdf",
    kind: { label: "link", link: { path: "demo.pdf" } },
  });
  projection.attachmentInventory.display.push({
    ...projection.attachmentInventory.display[0],
    sectionTitle: "Demo PDF",
    sectionTitleText: "Demo PDF",
    linkPath: "demo.pdf",
    absolutePath: "/tmp/demo.pdf",
    mediaKind: "pdf",
  });
  projection.memory.records[0].title = "Demo Source";
  return projection;
};

class FakeWorker extends EventTarget {
  postMessage(): void {}
  terminate(): void {}
}

const clickNav = (viewKey: string): void => {
  const button = document.querySelector<HTMLButtonElement>(`button[data-view="${viewKey}"]`);
  expect(button).toBeTruthy();
  button?.click();
};

const sourceButton = (sourceId: string): HTMLButtonElement => {
  const button = document.querySelector<HTMLButtonElement>(`button[data-source-id="${sourceId}"]`);
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
};

const view = (): string | null => document.querySelector("#app")?.getAttribute("data-view") ?? null;

const statusText = (): string => document.querySelector("#status")?.textContent ?? "";

const waitForText = async (text: string): Promise<void> => {
  await vi.waitFor(() => expect(document.body.textContent).toContain(text));
};

const waitForView = async (viewKey: string): Promise<void> => {
  await vi.waitFor(() => expect(view()).toBe(viewKey));
};

const textResponse = (body: string): Response =>
  new Response(body, { headers: { "content-type": "text/plain" } });

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

const fetchedPaths = (fetch: ReturnType<typeof vi.fn>): string[] =>
  fetch.mock.calls.map(([input]) => {
    const url = input instanceof URL ? input : new URL(String(input), window.location.href);
    return url.pathname;
  });
