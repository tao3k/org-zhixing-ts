import { afterEach, describe, expect, it, vi } from "vitest";
import { mountOrgZhixingApp } from "../src/app";
import type { StaticSiteData, StaticSourceProjection } from "../src/staticSiteData";
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
root = "blog"
default_source = "wallpaper-gallery"

[[content.sources]]
id = "wallpaper-gallery"
title = "Wallpaper Attachment Gallery"
file = "wallpaper-gallery.org"

[[content.sources]]
id = "demo"
title = "Demo Source"
file = "org-zhixing-demo.org"

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

    await waitForText("1 display items");
    expect(view()).toBe("gallery");
    expect(statusText()).toContain("static");
    expect(document.querySelectorAll(".attachment-card")).toHaveLength(1);

    clickNav("records");
    await waitForView("records");
    expect(new URL(window.location.href).searchParams.get("view")).toBe("records");
    expect(document.querySelectorAll(".org-record-render")).toHaveLength(1);
    expect(document.body.textContent).toContain("Static rendered body");
    expect(document.body.textContent).not.toContain("No notes records found");

    clickNav("memory");
    await waitForView("memory");
    expect(new URL(window.location.href).searchParams.get("view")).toBe("memory");
    expect(document.querySelectorAll(".memory-record")).toHaveLength(1);
    expect(document.querySelectorAll(".org-record-render--memory")).toHaveLength(1);
    expect(document.body.textContent).not.toContain("No memory records in this source");

    clickNav("gallery");
    await waitForView("gallery");
    expect(document.querySelectorAll(".attachment-card")).toHaveLength(1);
    expect(document.body.textContent).toContain("1 display items");

    clickNav("agenda");
    await waitForView("agenda");
    expect(new URL(window.location.href).searchParams.get("view")).toBe("agenda");
    expect(document.body.textContent).toContain(
      "Agenda window 2026-05-15 - 2026-05-21 has no projected rows.",
    );
    expect(document.body.textContent).toContain("Static Gallery");
    expect(document.body.textContent).toContain("<2020-12-19 Sat>-<2020-12-19 Sat>");
  });

  it("switches source navigator entries without reusing stale view cache", async () => {
    mountStaticApp();

    await waitForText("Wallpaper Attachment Gallery");
    sourceButton("demo").click();

    await waitForText("Demo Source");
    const url = new URL(window.location.href);
    expect(url.searchParams.get("source")).toBe("org-zhixing-demo.org");
    expect(url.searchParams.get("view")).toBe("gallery");
    expect(document.querySelector("#active-source-title")?.textContent).toBe("Demo Source");
    expect(document.querySelector(".attachment-gallery-header")?.textContent).toContain(
      "org-zhixing-demo.org",
    );
    expect(document.body.textContent).not.toContain("wallpaper-gallery.org; 1 are image media");

    clickNav("records");
    await waitForText("Demo rendered body");
    expect(document.body.textContent).not.toContain("Static rendered body");
  });
});

const mountStaticApp = () => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", fetchStaticFixture());
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

const staticSiteFixture = (): StaticSiteData => ({
  schemaVersion: 1,
  generatedAt: "2026-05-20T00:00:00.000Z",
  configPath: "org-zhixing.toml",
  orgize: { buildTime: "test", gitHash: "test" },
  sources: [staticProjection(), demoProjection()],
});

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
