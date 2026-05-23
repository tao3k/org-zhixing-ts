import { describe, expect, it } from "vitest";
import { routePathForView } from "../src/react/routeViewHelpers";

describe("React Router boundary", () => {
  it("uses path-first routes for every Org Zhixing view", () => {
    expect(routePathForView("blog")).toBe("/blogs");
    expect(routePathForView("gallery")).toBe("/gallery");
    expect(routePathForView("records")).toBe("/notes");
    expect(routePathForView("travel")).toBe("/travel");
    expect(routePathForView("memory")).toBe("/memory");
    expect(routePathForView("agenda")).toBe("/agenda");
    expect(routePathForView("capture")).toBe("/capture");
    expect(routePathForView("diagnostics")).toBe("/diagnostics");
  });
});
