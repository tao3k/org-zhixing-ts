import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppDomNodes } from "../src/appDom";
import { bindTravelVirtualList } from "../src/travelVirtualList";

describe("Travel virtual list", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("enhances travel cards with a TanStack Virtual measured scroll surface", async () => {
    const dom = mountVirtualTravelDom();
    const controller = new AbortController();
    bindTravelVirtualList(dom, controller.signal);
    await Promise.resolve();

    const list = dom.view.querySelector<HTMLElement>("[data-travel-virtual-list]");
    expect(list?.classList.contains("travel-card-grid--virtual")).toBe(true);
    expect(list?.querySelector(".travel-virtual-spacer")).toBeTruthy();
    expect(list?.querySelectorAll(".travel-virtual-row").length).toBeGreaterThan(0);
    expect(list?.querySelector("[data-travel-card]")?.textContent).toContain("Place");
    expect(list?.style.height).toBe("");

    controller.abort();
  });

  it("does not virtualize small Travel lists", async () => {
    const dom = mountVirtualTravelDom(22);
    const controller = new AbortController();
    bindTravelVirtualList(dom, controller.signal);
    await Promise.resolve();

    const list = dom.view.querySelector<HTMLElement>("[data-travel-virtual-list]");
    expect(list?.dataset.travelVirtualized).toBe("skipped");
    expect(list?.classList.contains("travel-card-grid--virtual")).toBe(false);
    expect(list?.querySelectorAll("[data-travel-card]")).toHaveLength(22);

    controller.abort();
  });

  it("does not touch ResizeObserver for real-scale Travel lists", async () => {
    let resizeObserverConstructed = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor() {
          resizeObserverConstructed += 1;
        }
        disconnect(): void {}
        observe(): void {}
        unobserve(): void {}
      },
    );
    const dom = mountVirtualTravelDom(22);
    const controller = new AbortController();
    bindTravelVirtualList(dom, controller.signal);
    await Promise.resolve();

    expect(resizeObserverConstructed).toBe(0);
    expect(
      dom.view.querySelector<HTMLElement>("[data-travel-virtual-list]")?.dataset.travelVirtualized,
    ).toBe("skipped");

    controller.abort();
  });
});

const mountVirtualTravelDom = (count = 96): AppDomNodes => {
  document.body.innerHTML = `
    <div id="view">
      <div class="travel-card-grid" data-travel-virtual-list>
        ${Array.from(
          { length: count },
          (_, index) => `
            <article class="travel-place-card" data-travel-card>
              <div class="travel-card-head"><h3>Place ${index + 1}</h3></div>
            </article>
          `,
        ).join("")}
      </div>
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
