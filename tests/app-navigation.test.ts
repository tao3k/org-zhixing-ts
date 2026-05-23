import { afterEach, describe, expect, it, vi } from "vitest";
import { mountOrgZhixingApp } from "../src/app";
import { attachmentGalleryFromSources } from "../src/attachmentGalleryModel";
import { sourcePickerChangeEvent } from "../src/sourcePicker";
import type { StaticSiteData, StaticSourceProjection } from "../src/staticSiteData";
import { record, sectionRecord, sourceRange } from "./modelFixtures";
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
label = "Blogs"
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
    await vi.waitFor(() => expect(document.querySelectorAll(".memory-record")).toHaveLength(1));
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
    selectSource("org-zhixing-demo.org");

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

  it("uses source query only as boot input and keeps navigation URLs source-free", async () => {
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

  it("clears stale in-view hashes when app navigation rewrites the route", async () => {
    mountStaticApp("/?view=blog#stale-blog-anchor");

    await waitForView("blog");
    await vi.waitFor(() => expect(new URL(window.location.href).hash).toBe(""));

    window.history.replaceState(null, "", "/?view=blog#syntax-heading");
    clickNav("travel");
    await waitForView("travel");

    const url = new URL(window.location.href);
    expect(url.searchParams.get("view")).toBe("travel");
    expect(url.searchParams.get("source")).toBeNull();
    expect(url.hash).toBe("");
  });

  it("keeps Zen reading chrome-free and supports keyboard exit and article switching", async () => {
    mountStaticApp("/?view=blog", fetchBlogStaticFixture());

    await waitForText("First Article");
    document.querySelector<HTMLButtonElement>('button[data-blog-article="101"]')?.click();

    await waitForText("First body");
    expect(readerMode()).toBe("zen");
    expect(document.querySelector(".zen-toolbar")).toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await waitForText("Second body");
    expect(new URL(window.location.href).searchParams.get("article")).toBe("202");
    expect(readerMode()).toBe("zen");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect(readerMode()).toBe("library"));
    expect(new URL(window.location.href).searchParams.get("zen")).toBeNull();
    expect(document.querySelector(".blog-index")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Second body");
  });

  it("loads source shards on demand while keeping site-wide Gallery and Records stable", async () => {
    const fetch = vi.fn(fetchShardedStaticFixture());
    const createWorker = vi.fn(() => new FakeWorker() as unknown as Worker);
    mountStaticApp("/", fetch, createWorker);

    await waitForText("2 image items");
    await vi.waitFor(() => expect(statusText()).toContain("static"));
    expect(document.body.textContent).toContain("across 3 Org sources");
    expect(fetchedPaths(fetch)).toContain("/org-zhixing.static.json");
    expect(fetchedPaths(fetch)).not.toContain("/org-zhixing.sources/wallpaper-gallery.json");
    expect(createWorker).not.toHaveBeenCalled();

    clickNav("records");
    await waitForText("2 indexed notes from 2 Org sources");
    expect(document.body.textContent).toContain("Static rendered body");
    expect(document.body.textContent).toContain("Demo rendered body");
    expect(fetchedPaths(fetch)).toEqual(
      expect.arrayContaining([
        "/org-zhixing.sources/wallpaper-gallery.json",
        "/org-zhixing.sources/demo.json",
        "/org-zhixing.sources/travel.json",
        "/org-zhixing.attachments/wallpaper-gallery.json",
        "/org-zhixing.attachments/demo.json",
        "/org-zhixing.attachments/travel.json",
        "/org-zhixing.sections/wallpaper-gallery.json",
        "/org-zhixing.sections/demo.json",
        "/org-zhixing.sections/travel.json",
      ]),
    );
    expect(fetchedPaths(fetch)).not.toContain("/org-zhixing.memory/wallpaper-gallery.json");

    clickNav("memory");
    await waitForView("memory");
    await vi.waitFor(() => expect(document.querySelectorAll(".memory-record")).toHaveLength(1));
    expect(fetchedPaths(fetch)).toContain("/org-zhixing.sections/wallpaper-gallery.json");
    expect(fetchedPaths(fetch)).toContain("/org-zhixing.memory/wallpaper-gallery.json");
    expect(createWorker).not.toHaveBeenCalled();
  });

  it("keeps the static page visible while agenda shards load on demand", async () => {
    const delayedSource = deferred<Response>();
    const delayedAgenda = deferred<Response>();
    const baseFetch = fetchShardedStaticFixture();
    const fetch = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof URL ? input : new URL(String(input), window.location.href);
      if (url.pathname === "/org-zhixing.sources/wallpaper-gallery.json") {
        return delayedSource.promise;
      }
      if (url.pathname === "/org-zhixing.agenda/wallpaper-gallery.json") {
        return delayedAgenda.promise;
      }
      return baseFetch(input);
    });
    mountStaticApp("/", fetch);

    await waitForText("2 image items");
    clickNav("agenda");

    await vi.waitFor(() => {
      expect(fetchedPaths(fetch)).toContain("/org-zhixing.sources/wallpaper-gallery.json");
      expect(fetchedPaths(fetch)).toContain("/org-zhixing.agenda/wallpaper-gallery.json");
    });
    expect(document.body.textContent).toContain("2 image items");
    expect(document.body.textContent).not.toContain("Loading Org source");
    expect(document.body.textContent).not.toContain("Projecting agenda intelligence");

    delayedSource.resolve(jsonResponse(sourceShardFixture(staticProjection())));
    delayedAgenda.resolve(
      jsonResponse({
        schemaVersion: 1,
        sourceId: "wallpaper-gallery",
        sourceFile: "blog/wallpaper-gallery.org",
        agendaRange: staticProjection().agendaRange,
        agendaView: staticProjection().agendaView,
      }),
    );
    await waitForText("Compiled sections");
    expect(document.body.textContent).toContain("Static Gallery");
  });
});

const mountStaticApp = (
  path = "/",
  fetch = fetchStaticFixture(),
  createWorker = () => new FakeWorker() as unknown as Worker,
) => {
  window.history.replaceState(null, "", path);
  vi.stubGlobal("fetch", fetch);
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);
  return mountOrgZhixingApp(root, { createWorker });
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
    sources.map((source) => [`/org-zhixing.sources/${source.id}.json`, sourceShardFixture(source)]),
  );
  const memoryShards = new Map(
    sources.map((source) => [
      `/org-zhixing.memory/${source.id}.json`,
      {
        schemaVersion: 1,
        sourceId: source.id,
        sourceFile: source.sourceFile,
        memory: source.memory,
      },
    ]),
  );
  const sectionShards = new Map(
    sources.map((source) => [
      `/org-zhixing.sections/${source.id}.json`,
      {
        schemaVersion: 1,
        sourceId: source.id,
        sourceFile: source.sourceFile,
        sectionIndex: source.sectionIndex,
      },
    ]),
  );
  const attachmentShards = new Map(
    sources.map((source) => [
      `/org-zhixing.attachments/${source.id}.json`,
      {
        schemaVersion: 1,
        sourceId: source.id,
        sourceFile: source.sourceFile,
        attachmentInventory: source.attachmentInventory,
      },
    ]),
  );
  const agendaShards = new Map(
    sources.map((source) => [
      `/org-zhixing.agenda/${source.id}.json`,
      {
        schemaVersion: 1,
        sourceId: source.id,
        sourceFile: source.sourceFile,
        agendaRange: source.agendaRange,
        agendaView: source.agendaView,
      },
    ]),
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
    const memoryShard = memoryShards.get(url.pathname);
    if (memoryShard) {
      return jsonResponse(memoryShard);
    }
    const sectionShard = sectionShards.get(url.pathname);
    if (sectionShard) {
      return jsonResponse(sectionShard);
    }
    const attachmentShard = attachmentShards.get(url.pathname);
    if (attachmentShard) {
      return jsonResponse(attachmentShard);
    }
    const agendaShard = agendaShards.get(url.pathname);
    if (agendaShard) {
      return jsonResponse(agendaShard);
    }
    return new Response("not found", { status: 404 });
  };
};

const fetchBlogStaticFixture = () => {
  const sources = [blogProjection()];
  const staticSite = {
    ...staticSiteBase(),
    blog: blogIndexFixture(sources),
    sources,
  };
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

const staticSiteFixture = (): StaticSiteData => ({
  ...staticSiteBase(),
  sources: [staticProjection(), demoProjection(), travelProjection()],
});

const staticSiteBase = (): Omit<StaticSiteData, "sources"> => ({
  schemaVersion: 1,
  generatedAt: "2026-05-20T00:00:00.000Z",
  configPath: "org-zhixing.toml",
  orgize: { buildTime: "test", gitHash: "test" },
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
    agendaShardPath: `org-zhixing.agenda/${source.id}.json`,
    attachmentShardPath: `org-zhixing.attachments/${source.id}.json`,
    memoryShardPath: `org-zhixing.memory/${source.id}.json`,
    sectionShardPath: `org-zhixing.sections/${source.id}.json`,
  })),
});

const sourceShardFixture = (source: StaticSourceProjection): StaticSourceProjection => {
  const projection = structuredClone(source);
  delete projection.agendaRange;
  delete projection.agendaView;
  delete projection.attachmentInventory;
  delete projection.memory;
  delete projection.sectionIndex;
  projection.agendaShardPath = `org-zhixing.agenda/${source.id}.json`;
  projection.attachmentShardPath = `org-zhixing.attachments/${source.id}.json`;
  projection.memoryShardPath = `org-zhixing.memory/${source.id}.json`;
  projection.sectionShardPath = `org-zhixing.sections/${source.id}.json`;
  return projection;
};

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
  projection.sectionIndex!.records = [
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
  projection.attachmentInventory!.entries = [];
  projection.attachmentInventory!.display = [];
  projection.agendaView!.cards = [];
  projection.agendaView!.totalCandidates = 0;
  projection.memory!.stats.totalRecords = 0;
  projection.memory!.stats.currentRecords = 0;
  projection.memory!.records = [];
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
  projection.sectionIndex!.records[0].title = "Demo Source";
  projection.sectionIndex!.records[0].titleText = "Demo Source";
  projection.sectionIndex!.records[0].outlinePath = ["Demo Source"];
  projection.sectionIndex!.records[0].outlinePathText = ["Demo Source"];
  projection.attachmentInventory!.entries[0].sectionTitle = "Demo Source";
  projection.attachmentInventory!.display[0].sectionTitle = "Demo Source";
  projection.attachmentInventory!.display[0].sectionTitleText = "Demo Source";
  projection.attachmentInventory!.entries.push({
    ...projection.attachmentInventory!.entries[0],
    path: "demo.pdf",
    absolutePath: "/tmp/demo.pdf",
    kind: { label: "link", link: { path: "demo.pdf" } },
  });
  projection.attachmentInventory!.display.push({
    ...projection.attachmentInventory!.display[0],
    sectionTitle: "Demo PDF",
    sectionTitleText: "Demo PDF",
    linkPath: "demo.pdf",
    absolutePath: "/tmp/demo.pdf",
    mediaKind: "pdf",
  });
  projection.memory!.records[0].title = "Demo Source";
  return projection;
};

const blogProjection = (): StaticSourceProjection => {
  const projection = structuredClone(staticProjection());
  projection.id = "blog-demo";
  projection.name = "Blog Demo";
  projection.file = "blog-demo.org";
  projection.sourceFile = "blog/blog-demo.org";
  projection.sourceBytes = 512;
  projection.html = `
    <main>
      <h1>First Article</h1>
      <p>First body</p>
      <h1>Second Article</h1>
      <p>Second body</p>
    </main>
  `;
  projection.viewIndex.records = [
    record({
      effectiveTags: ["blog", "writing"],
      properties: [{ key: "DATE", value: "<2026-05-17 Sun>" }],
      rangeStart: 101,
      title: "First Article",
    }),
    record({
      effectiveTags: ["blog", "writing"],
      properties: [{ key: "DATE", value: "<2026-05-16 Sat>" }],
      rangeStart: 202,
      title: "Second Article",
    }),
  ];
  projection.sectionIndex!.records = [
    sectionRecord({
      effectiveTags: ["blog", "writing"],
      level: 1,
      outlinePathText: ["First Article"],
      rangeStart: 101,
      title: "First Article",
    }),
    sectionRecord({
      effectiveTags: ["blog", "writing"],
      level: 1,
      outlinePathText: ["Second Article"],
      rangeStart: 202,
      title: "Second Article",
    }),
  ];
  projection.attachmentInventory!.entries = [];
  projection.attachmentInventory!.display = [];
  projection.agendaView!.cards = [];
  projection.agendaView!.totalCandidates = 0;
  projection.memory!.stats.totalRecords = 0;
  projection.memory!.stats.currentRecords = 0;
  projection.memory!.records = [];
  return projection;
};

const blogIndexFixture = (sources: StaticSourceProjection[]): StaticSiteData["blog"] => {
  const articles = sources.flatMap((source) =>
    source.viewIndex.records.map((article) => ({
      ...article,
      file: source.file,
      sourceFile: source.sourceFile,
      sourceId: source.id,
      sourceName: source.name,
    })),
  );
  return {
    articleCount: articles.length,
    articles,
    dateRange: { start: "<2026-05-16 Sat>", end: "<2026-05-17 Sun>" },
    siteWide: true,
    sourceCount: sources.length,
    tagFacets: [{ tag: "writing", count: articles.length }],
  };
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

const selectSource = (sourceFile: string): void => {
  const picker = document.querySelector<HTMLElement>("#source-picker");
  expect(picker).toBeTruthy();
  expect(document.querySelector("select#source-select")).toBeNull();
  picker!.dispatchEvent(
    new CustomEvent(sourcePickerChangeEvent, {
      bubbles: true,
      detail: { sourceFile },
    }),
  );
};

const view = (): string | null => document.querySelector("#app")?.getAttribute("data-view") ?? null;

const readerMode = (): string | null =>
  document.querySelector("#app")?.getAttribute("data-reader-mode") ?? null;

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

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

const fetchedPaths = (fetch: ReturnType<typeof vi.fn>): string[] =>
  fetch.mock.calls.map(([input]) => {
    const url = input instanceof URL ? input : new URL(String(input), window.location.href);
    return url.pathname;
  });
