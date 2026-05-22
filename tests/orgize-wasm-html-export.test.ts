import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import init, { Org } from "orgize";

const require = createRequire(import.meta.url);

describe("orgize WASM HTML export projection", () => {
  beforeAll(async () => {
    await init({ module_or_path: readFileSync(require.resolve("orgize/wasm")) });
  });

  it("preserves standard Org HTML export blocks for downstream static projection", () => {
    const org = new Org(readFileSync("public/blog/travel.org", "utf8"));
    try {
      const html = org.html();

      expect(html).toContain('<div class="videoWrapper mb-4">');
      expect(html).toContain('src="https://www.youtube.com/embed/vb1-lHR7kRM"');
      expect(html).not.toContain("&lt;iframe");
      expect(html).not.toContain("#+begin_export html");
    } finally {
      org.free();
    }
  });
});
