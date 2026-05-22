import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { AppDomNodes } from "../src/appDom";
import { bindTravelGlance } from "../src/travelGlance";

describe("Travel Zen Glance interactions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens a Zag dialog glance layer and lazy-loads map previews in place", async () => {
    const dom = mountTravelDom();
    const controller = new AbortController();
    bindTravelGlance(dom, controller.signal);

    dom.view.querySelector<HTMLButtonElement>("[data-travel-map-toggle]")?.click();
    const inlineMap = dom.view.querySelector<HTMLElement>("#travel-map-1");
    const inlineFrame = inlineMap?.querySelector<HTMLIFrameElement>("iframe");
    expect(inlineMap?.hasAttribute("hidden")).toBe(false);
    expect(inlineFrame?.getAttribute("src")).toContain("maps.google.com/maps");

    dom.view.querySelector<HTMLElement>("[data-travel-card]")?.click();

    const layer = await waitForElement('.travel-glance-layer[role="dialog"]');
    const backdrop = await waitForElement(".travel-glance-backdrop");
    expect(layer?.getAttribute("role")).toBe("dialog");
    expect(layer?.getAttribute("aria-modal")).toBe("true");
    expect(layer?.getAttribute("data-state")).toBe("open");
    expect(backdrop?.getAttribute("data-state")).toBe("open");
    expect(layer?.textContent).toContain("丽水站");
    const flow = await waitForElement("[data-travel-glance-flow]");
    await waitForLayout(flow);
    expect(flow.getAttribute("data-layout")).toBe("ready");
    expect(flow.getAttribute("aria-busy")).toBe("false");
    expect(
      layer?.querySelector('iframe[title="Google Maps preview for 丽水站"]')?.getAttribute("src"),
    ).toContain("maps.google.com/maps");
    expect(layer?.querySelector(".videoWrapper iframe")?.getAttribute("src")).toBe(
      "https://www.youtube.com/embed/vb1-lHR7kRM",
    );

    layer?.querySelector<HTMLButtonElement>("[data-travel-glance-close]")?.click();
    await waitForEmpty(".travel-glance-layer");
    expect(document.body.querySelector(".travel-glance-layer")).toBeNull();

    controller.abort();
  });

  it("keeps the glance layer full-height while preserving the desktop width contract", () => {
    const styles = [
      readFileSync("src/styles/travel.css", "utf8"),
      readFileSync("src/styles/responsive.css", "utf8"),
    ].join("\n");
    const entryStyles = readFileSync("src/styles.css", "utf8");
    const positioner = cssBlock(styles, ".travel-glance-positioner");
    const layer = cssBlock(styles, ".travel-glance-layer");
    const body = cssBlock(styles, ".travel-glance-body");
    const flow = cssBlock(styles, ".travel-glance-flow");
    const flowItem = cssBlock(styles, ".travel-glance-flow-item");
    const glanceMap = cssBlock(styles, ".travel-inline-map--glance");
    const mediaFlow = cssBlock(styles, ".travel-media-flow");
    const enrichCode = cssBlock(styles, ".travel-tags span,\n.travel-enrich code");
    const mobileLayer = styles.slice(styles.lastIndexOf(".travel-glance-layer"));

    expect(positioner).toContain("align-items: stretch;");
    expect(positioner).toContain("justify-items: center;");
    expect(positioner).toContain("padding: 0 22px;");
    expect(layer).toContain("width: min(80vw, 1360px);");
    expect(layer).toContain("height: 100dvh;");
    expect(layer).toContain("max-height: 100dvh;");
    expect(layer).toContain("border-radius: 0;");
    expect(body).toContain("overflow: auto;");
    expect(flow).toContain("position: relative;");
    expect(styles).toContain('.travel-glance-flow[data-layout="pending"]');
    expect(styles).toContain("opacity: 0;");
    expect(styles).not.toContain('data-layout="single"');
    expect(styles).toContain('.travel-glance-flow[data-layout="ready"] .travel-glance-flow-item');
    expect(styles).toContain("width: calc(33.333% - 10px);");
    expect(styles).toContain(
      '.travel-glance-flow[data-layout="ready"] .travel-glance-flow-item--full',
    );
    expect(styles).toContain("width: 100%;");
    expect(flowItem).toContain("break-inside: avoid;");
    expect(flowItem).toContain("overflow: hidden;");
    expect(flowItem).not.toContain("box-shadow:");
    expect(flowItem).not.toContain("border:");
    expect(glanceMap).toContain("border: 0;");
    expect(glanceMap).toContain("border-radius: 0;");
    expect(mediaFlow).not.toContain("border:");
    expect(mediaFlow).not.toContain("box-shadow:");
    expect(enrichCode).toContain("overflow-wrap: anywhere;");
    expect(enrichCode).toContain("max-width: 100%;");
    expect(mobileLayer).toContain("max-width: calc(100vw - 20px);");
    expect(mobileLayer).toContain("padding: 0 10px;");
    expect(styles).toContain(".travel-glance-flow");
    expect(styles).toContain("width: 100%;");
    expect(entryStyles).toContain('@import "./styles/travel.css";');
    expect(entryStyles).toContain('@import "./styles/responsive.css";');
  });
});

const cssBlock = (styles: string, selector: string): string => {
  const start = styles.indexOf(`${selector} {`);
  if (start < 0) {
    throw new Error(`Expected CSS selector ${selector}`);
  }
  const end = styles.indexOf("}", start);
  return styles.slice(start, end);
};

const mountTravelDom = (): AppDomNodes => {
  document.body.innerHTML = `
    <div id="view">
      <article class="travel-place-card" data-travel-card data-travel-title="丽水站">
        <button type="button" data-travel-map-toggle aria-expanded="false" aria-controls="travel-map-1">Map preview</button>
        <div id="travel-map-1" data-travel-map hidden>
          <iframe title="Google Maps preview for 丽水站" data-map-src="about:blank#maps.google.com/maps"></iframe>
        </div>
        <template data-travel-glance-template>
          <article class="travel-glance-article">
            <h3>丽水站</h3>
            <div class="travel-glance-flow" data-travel-glance-flow data-layout="pending" aria-busy="true">
              <span class="travel-glance-sizer" aria-hidden="true"></span>
              <dl class="travel-glance-facts travel-glance-flow-item travel-glance-flow-item--full"></dl>
              <section class="travel-media-flow travel-glance-flow-item travel-glance-flow-item--full rendered-html">
                <div class="videoWrapper mb-4">
                  <iframe title="YouTube video" src="https://www.youtube.com/embed/vb1-lHR7kRM"></iframe>
                </div>
              </section>
              <div class="travel-glance-flow-item travel-glance-flow-item--full" data-travel-map>
                <iframe title="Google Maps preview for 丽水站" data-map-src="about:blank#maps.google.com/maps"></iframe>
              </div>
            </div>
          </article>
        </template>
      </article>
    </div>
  `;
  return {
    sourceFeed: document.createElement("div"),
    status: document.createElement("output"),
    siteTitle: document.createElement("h1"),
    sourceSelect: document.createElement("select"),
    activeSourceTitle: document.createElement("div"),
    activeSourcePath: document.createElement("div"),
    tabs: document.createElement("nav"),
    view: document.querySelector<HTMLDivElement>("#view") as HTMLDivElement,
  };
};

const waitForElement = async (selector: string): Promise<HTMLElement> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const element = document.body.querySelector<HTMLElement>(selector);
    if (element) {
      return element;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Expected ${selector} to be mounted`);
};

const waitForEmpty = async (selector: string): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!document.body.querySelector(selector)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Expected ${selector} to be unmounted`);
};

const waitForLayout = async (element: HTMLElement): Promise<void> => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (element.dataset.layout !== "pending") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Expected travel glance layout to leave pending state");
};
