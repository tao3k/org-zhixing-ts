import type { AppDomNodes } from "../appDom";
import type { ViewKey } from "../model";

export function routePathForView(view: ViewKey): string {
  switch (view) {
    case "blog":
      return "/blogs";
    case "gallery":
      return "/gallery";
    case "records":
      return "/notes";
    case "memory":
      return "/memory";
    case "travel":
      return "/travel";
    case "agenda":
      return "/agenda";
    case "capture":
      return "/capture";
    case "diagnostics":
      return "/diagnostics";
  }
}

export function viewForPath(pathname: string): ViewKey {
  if (pathname.startsWith("/gallery")) return "gallery";
  if (pathname.startsWith("/notes")) return "records";
  if (pathname.startsWith("/memory")) return "memory";
  if (pathname.startsWith("/travel")) return "travel";
  if (pathname.startsWith("/agenda")) return "agenda";
  if (pathname.startsWith("/capture")) return "capture";
  if (pathname.startsWith("/diagnostics")) return "diagnostics";
  return "blog";
}

export function lifeFacetFor(view: ViewKey): string {
  switch (view) {
    case "blog":
      return "writing";
    case "gallery":
      return "images";
    case "records":
      return "notes / reading";
    case "memory":
      return "memory graph";
    case "travel":
      return "journeys";
    case "agenda":
      return "time";
    case "capture":
      return "capture";
    case "diagnostics":
      return "health";
  }
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    ? Boolean(
        target.closest(
          "input, textarea, select, button, [contenteditable='true'], [role='textbox']",
        ),
      )
    : false;
}

export function viewDomNodes(): AppDomNodes {
  const view = document.querySelector<HTMLDivElement>("#view");
  if (!view) {
    throw new Error("missing #view root");
  }
  return { view } as AppDomNodes;
}
