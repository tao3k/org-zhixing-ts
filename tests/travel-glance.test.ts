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

    const layer = await waitForElement(".travel-glance-layer");
    const backdrop = await waitForElement(".travel-glance-backdrop");
    expect(layer?.getAttribute("role")).toBe("dialog");
    expect(layer?.getAttribute("aria-modal")).toBe("true");
    expect(layer?.getAttribute("data-state")).toBe("open");
    expect(backdrop?.getAttribute("data-state")).toBe("open");
    expect(layer?.textContent).toContain("丽水站");
    expect(layer?.querySelector("iframe")?.getAttribute("src")).toContain("maps.google.com/maps");

    layer?.querySelector<HTMLButtonElement>("[data-travel-glance-close]")?.click();
    await waitForEmpty(".travel-glance-layer");
    expect(document.body.querySelector(".travel-glance-layer")).toBeNull();

    controller.abort();
  });

  it("keeps the glance layer full-height while preserving the desktop width contract", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const positioner = cssBlock(styles, ".travel-glance-positioner");
    const layer = cssBlock(styles, ".travel-glance-layer");
    const mobileLayer = styles.slice(styles.lastIndexOf(".travel-glance-layer"));

    expect(positioner).toContain("align-items: stretch;");
    expect(positioner).toContain("justify-items: center;");
    expect(positioner).toContain("padding: 0 22px;");
    expect(layer).toContain("width: min(80vw, 1360px);");
    expect(layer).toContain("height: 100dvh;");
    expect(layer).toContain("max-height: 100dvh;");
    expect(layer).toContain("border-radius: 0;");
    expect(mobileLayer).toContain("max-width: calc(100vw - 20px);");
    expect(mobileLayer).toContain("padding: 0 10px;");
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
          <section class="travel-glance-card">
            <h3>丽水站</h3>
            <div data-travel-map>
              <iframe title="Google Maps preview for 丽水站" data-map-src="about:blank#maps.google.com/maps"></iframe>
            </div>
          </section>
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
