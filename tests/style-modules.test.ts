import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("style module boundaries", () => {
  it("keeps the CSS entrypoint as an ordered module manifest", () => {
    const entry = readFileSync("src/styles.css", "utf8").trim().split("\n");

    expect(entry).toEqual([
      '@import "photoswipe/style.css";',
      '@import "./styles/theme.css";',
      '@import "./styles/foundation.css";',
      '@import "./styles/blog.css";',
      '@import "./styles/attachments.css";',
      '@import "./styles/travel.css";',
      '@import "./styles/records-memory.css";',
      '@import "./styles/agenda-list.css";',
      '@import "./styles/agenda-cockpit.css";',
      '@import "./styles/agenda-cockpit-responsive.css";',
      '@import "./styles/agenda-program.css";',
      '@import "./styles/agenda-program-responsive.css";',
      '@import "./styles/rendered-org.css";',
      '@import "./styles/blog-rendered.css";',
      '@import "./styles/responsive.css";',
    ]);
  });

  it("keeps product CSS modules below the monolith threshold", () => {
    const modules = readdirSync("src/styles").filter((name) => name.endsWith(".css"));
    const lineCounts = modules.map((name) => ({
      name,
      lines: readFileSync(join("src/styles", name), "utf8").split("\n").length - 1,
    }));

    expect(lineCounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "travel.css" }),
        expect.objectContaining({ name: "theme.css" }),
        expect.objectContaining({ name: "agenda-program.css" }),
        expect.objectContaining({ name: "rendered-org.css" }),
      ]),
    );
    expect(Math.max(...lineCounts.map(({ lines }) => lines))).toBeLessThanOrEqual(1200);
  });

  it("roots the visual system in package-backed theme tokens", () => {
    const theme = readFileSync("src/styles/theme.css", "utf8");

    expect(theme).toContain('@import "@radix-ui/colors/slate.css";');
    expect(theme).toContain('@import "@radix-ui/colors/blue.css";');
    expect(theme).toContain("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");
    expect(theme).toContain("@fontsource/roboto-mono/files/roboto-mono-latin-400-normal.woff2");
    expect(theme).toContain("@fontsource/roboto-mono/files/roboto-mono-latin-500-normal.woff2");
    expect(theme).toContain("--face-strong:");
    expect(theme).toContain("--face-salient:");
    expect(theme).toContain("--face-faded:");
    expect(theme).toContain("--surface-subtle:");
  });

  it("keeps typography and product surfaces on semantic tokens", () => {
    const styles = readdirSync("src/styles")
      .filter((name) => name.endsWith(".css"))
      .map((name) => readFileSync(join("src/styles", name), "utf8"))
      .join("\n");
    const travel = readFileSync("src/styles/travel.css", "utf8");

    expect(styles).not.toMatch(/font-size:\s*clamp\(/);
    expect(travel).toContain("color: var(--face-strong);");
    expect(travel).toContain("background: var(--surface-paper);");
    expect(travel).toContain("border: 1px solid var(--hairline");
    expect(travel).not.toContain('data-layout="single"');
  });

  it("keeps rendered Org styled by semantic elements, not page-specific cards", () => {
    const renderedOrg = readFileSync("src/styles/rendered-org.css", "utf8");

    expect(renderedOrg).toContain(".rendered-html h2::before");
    expect(renderedOrg).toContain(".org-meta-chip--deadline");
    expect(renderedOrg).toContain(".org-meta-row--properties div");
    expect(renderedOrg).toContain(".rendered-html pre");
    expect(renderedOrg).toContain("border-left: 3px solid var(--face-salient);");
    expect(renderedOrg).toContain(".rendered-html table");
    expect(renderedOrg).toContain(".rendered-html .todo");
    expect(renderedOrg).toContain(".rendered-html .done");
    expect(renderedOrg).toContain(".rendered-html .tag");
  });
});
