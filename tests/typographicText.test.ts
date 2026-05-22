import { describe, expect, it } from "vitest";
import { createAgentMemoryView } from "../src/memoryModel";
import { createDocumentView, withAgentMemory } from "../src/model";
import { renderView } from "../src/render";
import { renderSoftBreakText } from "../src/typographicText";
import { memoryResponse, record, sourceRange } from "./modelFixtures";

describe("typographic text rendering", () => {
  it("adds soft break opportunities while escaping unsafe text", () => {
    const html = renderSoftBreakText(
      "attachment:20201219_162324george-turmanidze-10.jpg.jpeg?<unsafe>",
    );

    expect(html).toContain("<wbr>");
    expect(html).toContain("&lt;unsafe&gt;");
    expect(html).not.toContain("<unsafe>");
    expect(html.replace(/<wbr>/g, "")).toBe(
      "attachment:20201219_162324george-turmanidze-10.jpg.jpeg?&lt;unsafe&gt;",
    );
  });

  it("renders Memory links with soft break opportunities", () => {
    const source = sourceRange(19);
    const longAttachment = "attachment:20201219_162324george-turmanidze-10.jpg.jpeg";
    const document = withAgentMemory(
      createDocumentView([
        record({
          effectiveTags: ["memory", "ATTACH"],
          rangeStart: 19,
          title: "ArtStation memory",
        }),
      ]),
      createAgentMemoryView(
        memoryResponse({
          source,
          title: "ArtStation memory",
          cards: [
            {
              anchor: null,
              authority: [],
              decision: {
                code: "MEM004",
                kind: "current",
                nextAction: "Keep link evidence readable.",
                severity: "info",
                title: "Background memory",
              },
              effectiveTags: ["memory", "ATTACH"],
              evidence: [],
              links: [
                {
                  description: "ArtStation - Abandoned House, George Turmanidze",
                  path: "https://www.artstation.com/artwork/JlXwym",
                  source,
                },
                {
                  description: "attachment link",
                  path: longAttachment,
                  source,
                },
              ],
              source,
              tags: ["memory"],
              title: "ArtStation memory",
              todo: null,
              todoState: null,
            },
          ],
        }),
      ),
    );

    const html = renderView({
      view: "memory",
      document,
      articleHtml: "<main><h2>ArtStation memory</h2><p>Rendered memory body.</p></main>",
    });

    expect(html).toContain('class="memory-link-item"');
    expect(html).toContain("<wbr>");
    expect(html.replace(/<wbr>/g, "")).toContain(longAttachment);
  });
});
