import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import init, { Org } from "orgize";
import { parse } from "smol-toml";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(projectRoot, "public");
const outputPath = resolve(projectRoot, ".cache/org-zhixing/static-site.json");
const configPath = "org-zhixing.toml";

const main = async () => {
  const configText = await readFile(resolve(publicRoot, configPath), "utf8");
  const config = parseConfig(configText);
  const require = createRequire(import.meta.url);
  await init({ module_or_path: readFileSync(require.resolve("orgize/wasm")) });

  const sources = [];
  for (const source of config.sources) {
    const startedAt = performance.now();
    sources.push(await projectSource(source, config));
    console.log(
      `static org projection: ${source.sourceFile} ${Math.round(performance.now() - startedAt)}ms`,
    );
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    configPath,
    configSha256: sha256(configText),
    orgize: {
      buildTime: Org.buildTime,
      gitHash: Org.gitHash,
    },
    sources,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest)}\n`, "utf8");
  console.log(`static org projection: wrote ${relativeOutputPath()}`);
};

const projectSource = async (source, config) => {
  const sourceText = await readFile(resolve(publicRoot, source.sourceFile), "utf8");
  const org = new Org(sourceText);
  try {
    return {
      ...source,
      sourceBytes: Buffer.byteLength(sourceText),
      viewIndex: parseJson(org.viewIndexJson(source.sourceFile)),
      sectionIndex: parseJson(org.sectionIndexJson(source.sourceFile)),
      html: org.html(),
      attachmentInventory: parseJson(
        org.attachmentInventoryJson(JSON.stringify(config.attachments)),
      ),
      memory: parseJson(org.memoryJson()),
      agendaView: parseJson(org.agendaViewJson(JSON.stringify(config.agendaViewRequest))),
      lint: parseJson(org.lintJson()),
    };
  } finally {
    org.free();
  }
};

const parseConfig = (text) => {
  const raw = asRecord(parse(text));
  const content = asOptionalRecord(raw.content);
  const contentRoot = normalizeDir(readString(content, "root", "blog"));
  const sources = parseSources(content?.sources, contentRoot);
  return {
    contentRoot,
    sources:
      sources.length > 0
        ? sources
        : [sourceFromPath(contentRoot, "demo", "org-zhixing-demo.org", "Org Zhixing Demo")],
    attachments: parseAttachments(asOptionalRecord(raw.attachments), contentRoot),
    agendaViewRequest: agendaViewRequest(asOptionalRecord(raw.agenda)),
  };
};

const parseSources = (raw, contentRoot) =>
  Array.isArray(raw)
    ? raw
        .map(asRecord)
        .map((source) =>
          sourceFromPath(
            contentRoot,
            readString(source, "id", "demo"),
            normalizeOrgPath(readString(source, "file", "org-zhixing-demo.org"), contentRoot),
            readString(source, "title", readString(source, "file", "org-zhixing-demo.org")),
          ),
        )
    : [];

const sourceFromPath = (contentRoot, id, file, name) => ({
  id,
  name,
  file,
  sourceFile: `${contentRoot}/${file}`,
});

const parseAttachments = (raw, contentRoot) => ({
  attachIdDir: normalizeAttachmentDir(readString(raw, "attach_id_dir", ".attach"), contentRoot),
  checkVcs: readBoolean(raw, "check_vcs", false),
  checkAnnex: readBoolean(raw, "check_annex", false),
  scanOrphans: readBoolean(raw, "scan_orphans", false),
});

const agendaViewRequest = (raw) => {
  const start = readDate(raw, "start") ?? todayDate();
  const days = clampWholeNumber(readNumber(raw, "days", 7), 1, 31);
  return {
    start,
    end: addDays(start, days - 1),
    limit: readOptionalWholeNumber(raw, "limit"),
  };
};

const normalizeDir = (value) => {
  const normalized = value.replace(/^\/+|\/+$/g, "");
  assertSafePath(normalized);
  return normalized;
};

const normalizeOrgPath = (value, contentRoot) => {
  const prefix = `${contentRoot}/`;
  const normalized = (value.startsWith(prefix) ? value.slice(prefix.length) : value).replace(
    /^\/+/,
    "",
  );
  assertSafePath(normalized);
  if (!normalized.endsWith(".org")) {
    throw new Error(`Org source must end with .org: ${value}`);
  }
  return normalized;
};

const normalizeAttachmentDir = (value, contentRoot) => {
  const trimmed = value.replace(/^\/+|\/+$/g, "");
  const normalized =
    trimmed === ".attach"
      ? `${contentRoot}/.attach`
      : trimmed.startsWith(`${contentRoot}/`)
        ? trimmed
        : `${contentRoot}/${trimmed}`;
  assertSafeAttachmentPath(normalized);
  return normalized;
};

const assertSafePath = (value) => {
  if (
    value.length === 0 ||
    value.startsWith(".") ||
    value.includes("..") ||
    value.includes("//") ||
    value.includes("\\")
  ) {
    throw new Error(`unsafe config path: ${value}`);
  }
};

const assertSafeAttachmentPath = (value) => {
  const segments = value.split("/");
  if (
    value.length === 0 ||
    value.includes("..") ||
    value.includes("//") ||
    value.includes("\\") ||
    segments.some(
      (segment) => segment.length === 0 || (segment.startsWith(".") && segment !== ".attach"),
    )
  ) {
    throw new Error(`unsafe attachment path: ${value}`);
  }
};

const readString = (record, key, fallback) => {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
};

const readBoolean = (record, key, fallback) => {
  const value = record?.[key];
  return typeof value === "boolean" ? value : fallback;
};

const readNumber = (record, key, fallback) => {
  const value = record?.[key];
  return typeof value === "number" ? value : fallback;
};

const readOptionalWholeNumber = (record, key) => {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : null;
};

const readDate = (record, key) => {
  const value = record?.[key];
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`agenda ${key} must be YYYY-MM-DD`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

const todayDate = () => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
};

const addDays = (date, days) => {
  const normalized = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: normalized.getUTCFullYear(),
    month: normalized.getUTCMonth() + 1,
    day: normalized.getUTCDate(),
  };
};

const clampWholeNumber = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(value)));

const asOptionalRecord = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : null;

const asRecord = (value) => asOptionalRecord(value) ?? {};

const parseJson = (value) => JSON.parse(value);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const relativeOutputPath = () => outputPath.replace(`${projectRoot}/`, "");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
