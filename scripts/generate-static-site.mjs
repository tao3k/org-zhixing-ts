import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import init, { Org } from "orgize";
import { parse } from "smol-toml";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(projectRoot, "public");
const outputRoot = resolve(projectRoot, ".cache/org-zhixing");
const outputPath = resolve(outputRoot, "static-site.json");
const sourceShardPublicDir = "org-zhixing.sources";
const sourceShardRoot = resolve(outputRoot, sourceShardPublicDir);
const configPath = "org-zhixing.toml";

const main = async () => {
  const configText = await readFile(resolve(publicRoot, configPath), "utf8");
  const config = parseConfig(configText);
  config.sources = mergeSources(config.sources, await discoverOrgSources(config.contentRoot));
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

  await writeSourceShards(sources);
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    configPath,
    configSha256: sha256(configText),
    orgize: {
      buildTime: Org.buildTime,
      gitHash: Org.gitHash,
    },
    attachmentGallery: projectAttachmentGalleryView(sources),
    travel: projectTravelView(sources),
    sources: sources.map(sourceSummary),
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest)}\n`, "utf8");
  console.log(`static org projection: wrote ${relativeOutputPath()}`);
};

const projectSource = async (source, config) => {
  const sourceText = await readFile(resolve(publicRoot, source.sourceFile), "utf8");
  const org = new Org(sourceText);
  try {
    const viewIndex = parseJson(org.viewIndexJson(source.sourceFile));
    const agendaProjection = projectAgendaView(org, viewIndex, config.agenda);
    const attachmentInventory = await projectAttachmentInventory(org, config, source);
    return {
      ...source,
      sourceBytes: Buffer.byteLength(sourceText),
      viewIndex,
      sectionIndex: parseJson(org.sectionIndexJson(source.sourceFile)),
      html: org.html(),
      attachmentInventory,
      memory: parseJson(org.memoryJson()),
      agendaRange: agendaProjection.range,
      agendaView: agendaProjection.view,
      lint: parseJson(org.lintJson()),
    };
  } finally {
    org.free();
  }
};

const writeSourceShards = async (sources) => {
  await rm(sourceShardRoot, { recursive: true, force: true });
  await mkdir(sourceShardRoot, { recursive: true });
  await Promise.all(
    sources.map((source) =>
      writeFile(sourceShardPath(source), `${JSON.stringify(source)}\n`, "utf8"),
    ),
  );
};

const sourceSummary = (source) => ({
  id: source.id,
  name: source.name,
  file: source.file,
  sourceFile: source.sourceFile,
  sourceBytes: source.sourceBytes,
  shardPath: joinPath(sourceShardPublicDir, `${safeShardId(source.id)}.json`),
});

const sourceShardPath = (source) => resolve(sourceShardRoot, `${safeShardId(source.id)}.json`);

const safeShardId = (value) =>
  String(value)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "source";

const parseConfig = (text) => {
  const raw = asRecord(parse(text));
  const content = asOptionalRecord(raw.content);
  const contentRoot = normalizeDir(
    readString(content, "content_dir", readString(content, "root", "blog")),
  );
  const sources = parseSources(content?.sources, contentRoot);
  return {
    contentRoot,
    sources,
    attachments: parseAttachments(asOptionalRecord(raw.attachments), contentRoot),
    agenda: agendaSettings(asOptionalRecord(raw.agenda)),
  };
};

const projectAgendaView = (org, viewIndex, configuredRange) => {
  const configured = requestAgendaView(org, configuredRange);
  if (configured.cards.length > 0) {
    return { range: configuredRange, view: configured };
  }
  const sourceRange = sourcePlanningAgendaRange(viewIndex.records, configuredRange);
  if (!sourceRange || sameAgendaRange(sourceRange, configuredRange)) {
    return { range: configuredRange, view: configured };
  }
  return { range: sourceRange, view: requestAgendaView(org, sourceRange) };
};

const requestAgendaView = (org, range) =>
  parseJson(
    org.agendaViewJson(
      JSON.stringify({
        start: range.start,
        end: range.end,
        limit: range.limit,
      }),
    ),
  );

const projectAttachmentInventory = async (org, config, source) => {
  const inventory = parseJson(org.attachmentInventoryJson(JSON.stringify(config.attachments)));
  const display = await Promise.all(
    inventory.display.map(async (record) => ({
      ...record,
      publicExists: await publicAttachmentExists(record, source.sourceFile),
    })),
  );
  return { ...inventory, display };
};

const projectAttachmentGalleryView = (sources) => {
  const records = sources.flatMap((source) =>
    source.attachmentInventory.display.filter(isImageAttachmentRecord).map((record) => ({
      record,
      sourceFile: source.sourceFile,
      sourceId: source.id,
      sourceName: source.name,
    })),
  );
  const entryCount = sources.reduce(
    (sum, source) => sum + source.attachmentInventory.entries.length,
    0,
  );
  return {
    records,
    entryCount,
    sourceCount: sources.length,
    label: `${sources.length} Org sources`,
    siteWide: true,
  };
};

const isImageAttachmentRecord = (record) =>
  record.mediaKind === "image" && record.publicExists !== false;

const publicAttachmentExists = async (record, sourceFile) => {
  try {
    await access(resolve(publicRoot, attachmentPublicPath(record, sourceFile)));
    return true;
  } catch {
    return false;
  }
};

const attachmentPublicPath = (record, sourceFile) => {
  const directoryPath = normalizePublicPath(record.directoryPath);
  const linkPath = normalizePublicPath(record.linkPath);
  const joined = joinPath(directoryPath, linkPath);
  const sourceRoot = normalizePublicPath(sourceFile).split("/")[0] ?? "";
  return sourceRoot && directoryPath.startsWith(`${sourceRoot}/`)
    ? joined
    : joinPath(publicDirname(sourceFile), joined);
};

const projectTravelView = (sources) => {
  const places = sources.flatMap((source) => projectTravelSource(source));
  const regions = [...new Set(places.map((place) => place.region).filter(Boolean))];
  const sourceCount = new Set(places.map((place) => place.sourceFile ?? place.sourceName)).size;
  return {
    places,
    regions,
    scannedSourceCount: sources.length,
    sourceCount: places.length > 0 ? sourceCount : 0,
    locatedCount: places.filter((place) => place.coordinates).length,
    enrichCandidateCount: places.filter((place) => place.needsEnrichment).length,
    siteWide: true,
  };
};

const projectTravelSource = (source) => {
  let currentRegion = null;
  const places = [];
  for (const record of source.sectionIndex.records.filter(isTravelCandidate)) {
    const title = sectionTitle(record);
    if (!title) {
      continue;
    }
    const headingRegion = regionFromHeading(title);
    if (headingRegion) {
      currentRegion = headingRegion;
    }
    places.push(createTravelPlace(record, currentRegion, source));
  }
  return places;
};

const createTravelPlace = (record, currentRegion, source) => {
  const title = sectionTitle(record);
  const headingRegion = regionFromHeading(title);
  const tags = [...new Set((record.effectiveTags ?? []).filter(Boolean))];
  const region = regionFromRecord(record) ?? currentRegion;
  const coordinates = coordinatesFromRecord(record);
  const placeId = propertyValue(record, "GOOGLE_PLACE_ID") ?? propertyValue(record, "PLACE_ID");
  const placeHints = placeHintsFromRecord(record);
  const explicitQuery =
    propertyValue(record, "GOOGLE_MAPS_QUERY") ??
    propertyValue(record, "MAPS_QUERY") ??
    propertyValue(record, "LOCATION_QUERY");
  const query = mapQuery(
    explicitQuery,
    coordinates,
    headingRegion ? [] : placeHints,
    headingRegion ?? title,
    region,
  );
  const enrichFields = enrichFieldsFor(record, coordinates, region, placeId);
  return {
    id: travelPlaceId(source.sourceFile, record.source.rangeStart),
    rangeStart: record.source.rangeStart,
    title,
    outline: outlineText(record),
    sourceFile: source.sourceFile ?? null,
    sourceName: source.name ?? null,
    region,
    tags,
    kind: travelKind(Boolean(headingRegion)),
    coordinates,
    query,
    googleMapsUrl: googleMapsSearchUrl(query, placeId),
    googleMapsEmbedUrl: googleMapsEmbedUrl(query),
    sourceLinks: sourceLinksFromRecord(record),
    evidence: evidenceFromRecord(record, coordinates, placeHints),
    enrichFields,
    needsEnrichment: enrichFields.length > 0,
  };
};

const isTravelCandidate = (record) => {
  if ((record.effectiveTags ?? []).some((tag) => tag.toLowerCase() === "travel")) {
    return true;
  }
  if (regionFromHeading(sectionTitle(record)) || regionFromRecord(record)) {
    return true;
  }
  return Boolean(coordinatesFromRecord(record) || propertyValue(record, "GOOGLE_MAPS_QUERY"));
};

const sectionTitle = (record) => normalizeDisplayText(record.titleText ?? record.title ?? "");

const normalizeDisplayText = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const regionFromRecord = (record) => {
  for (const item of record.outlinePathText ?? record.outlinePath ?? []) {
    const region = regionFromHeading(item);
    if (region) {
      return region;
    }
  }
  return null;
};

const regionFromHeading = (title) => {
  const match = /^游山玩水->(.+)$/.exec(normalizeDisplayText(title));
  return match ? match[1].trim() : null;
};

const travelKind = (isRegion) => {
  if (isRegion) return "region";
  return "place";
};

const mapQuery = (explicitQuery, coordinates, placeHints, title, region) => {
  if (explicitQuery) return explicitQuery;
  if (coordinates) return `${coordinates.lat},${coordinates.lon}`;
  const place = placeHints[0] ?? title;
  return region && !place.includes(region) ? `${place} ${region}` : place;
};

const coordinatesFromRecord = (record) => {
  const lat = propertyValue(record, "GEO_LAT") ?? propertyValue(record, "LATITUDE");
  const lon = propertyValue(record, "GEO_LON") ?? propertyValue(record, "LONGITUDE");
  if (lat && lon) {
    return coordinatePair(Number(lat), Number(lon), `${lat},${lon}`);
  }
  const raw =
    propertyValue(record, "地理坐标") ??
    propertyValue(record, "COORDINATES") ??
    propertyValue(record, "GEO") ??
    propertyValue(record, "LOCATION");
  return raw ? parseCoordinateText(raw) : null;
};

const parseCoordinateText = (raw) => {
  const decimalPair = /(-?\d{1,3}(?:\.\d+)?)\s*[;,]\s*(-?\d{1,3}(?:\.\d+)?)/.exec(raw);
  if (decimalPair) {
    return coordinatePair(Number(decimalPair[1]), Number(decimalPair[2]), raw);
  }
  const degreePair =
    /(-?\d{1,3}(?:\.\d+)?)\s*°?\s*[NS北南]?\s+(-?\d{1,3}(?:\.\d+)?)\s*°?\s*[EW东西]?/.exec(raw);
  return degreePair ? coordinatePair(Number(degreePair[1]), Number(degreePair[2]), raw) : null;
};

const coordinatePair = (lat, lon, raw) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { lat, lon, raw }
    : null;

const placeHintsFromRecord = (record) => {
  return [
    ...new Set(
      recordLinks(record)
        .filter((link) => link.path.startsWith("id:"))
        .map((link) => normalizeDisplayText(link.description))
        .filter(isPlaceHint),
    ),
  ];
};

const isPlaceHint = (value) =>
  value.length > 0 &&
  !value.startsWith("id:") &&
  !/youtube|youtu\.be|视频|日记|合集|播放|episode|vlog/i.test(value);

const sourceLinksFromRecord = (record) => {
  return [
    ...new Map(
      recordLinks(record)
        .filter((link) => /^https?:\/\//.test(link.path))
        .map((link) => [
          link.path,
          {
            kind: sourceLinkKind(link.path),
            label: normalizeDisplayText(link.description || link.path),
            url: link.path,
          },
        ]),
    ).values(),
  ];
};

const sourceLinkKind = (url) => {
  if (/youtube\.com|youtu\.be/.test(url)) return "video";
  if (/wikipedia\.org|baike\.baidu\.com/.test(url)) return "wiki";
  return "web";
};

const recordLinks = (record) =>
  (record.links ?? [])
    .map((link) => ({
      path: link.path ?? "",
      description: link.description ?? link.path ?? "",
    }))
    .filter((link) => link.path.length > 0);

const evidenceFromRecord = (record, coordinates, placeHints) => {
  const evidence = [];
  if (coordinates)
    evidence.push({ label: "coordinates", value: `${coordinates.lat}, ${coordinates.lon}` });
  for (const hint of placeHints.slice(0, 3)) evidence.push({ label: "place hint", value: hint });
  for (const property of (record.properties ?? []).filter(isTravelProperty).slice(0, 4)) {
    evidence.push({ label: property.key, value: property.value });
  }
  for (const timestamp of timestampEvidence(record).slice(0, 2)) {
    evidence.push({ label: "captured", value: timestamp });
  }
  return evidence;
};

const isTravelProperty = (property) =>
  [
    "地理坐标",
    "URL",
    "wikinfo-id",
    "GOOGLE_MAPS_QUERY",
    "GOOGLE_PLACE_ID",
    "GEO_LAT",
    "GEO_LON",
    "TRAVEL_REGION",
  ].includes(property.key);

const timestampEvidence = (record) => [
  ...new Set(
    (record.body ?? []).flatMap((slice) =>
      [...String(slice.text ?? "").matchAll(/\[(\d{4}-\d{2}-\d{2}[^\]]*)\]/g)].map(
        (match) => match[1],
      ),
    ),
  ),
];

const enrichFieldsFor = (record, coordinates, region, placeId) => {
  const fields = [];
  if (!coordinates) fields.push("GEO_LAT", "GEO_LON");
  if (!propertyValue(record, "GOOGLE_MAPS_QUERY")) fields.push("GOOGLE_MAPS_QUERY");
  if (!placeId) fields.push("GOOGLE_PLACE_ID");
  if (region && !propertyValue(record, "TRAVEL_REGION")) fields.push("TRAVEL_REGION");
  return fields;
};

const propertyValue = (record, key) =>
  (record.properties ?? []).find((property) => property.key.toUpperCase() === key.toUpperCase())
    ?.value ?? null;

const outlineText = (record) =>
  (record.outlinePathText ?? record.outlinePath ?? [sectionTitle(record)])
    .map(normalizeDisplayText)
    .filter(Boolean)
    .join(" / ");

const travelPlaceId = (sourceFile, rangeStart) => {
  const sourceSlug =
    sourceFile
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "current";
  return `${sourceSlug}-${rangeStart}`;
};

const googleMapsSearchUrl = (query, placeId) => {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", query);
  if (placeId) url.searchParams.set("query_place_id", placeId);
  return url.toString();
};

const googleMapsEmbedUrl = (query) => {
  const url = new URL("https://maps.google.com/maps");
  url.searchParams.set("q", query);
  url.searchParams.set("output", "embed");
  return url.toString();
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

const discoverOrgSources = async (contentRoot) => {
  const root = resolve(publicRoot, contentRoot);
  const files = await orgFiles(root);
  return files.map((file) =>
    sourceFromPath(contentRoot, sourceIdFromPath(file), file, sourceTitleFromPath(file)),
  );
};

const orgFiles = async (dir, prefix = "") => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await orgFiles(resolve(dir, entry.name), relative)));
    } else if (entry.isFile() && entry.name.endsWith(".org")) {
      files.push(relative);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
};

const mergeSources = (configured, discovered) => {
  const sources = new Map();
  for (const source of discovered) {
    sources.set(source.file, source);
  }
  for (const source of configured) {
    sources.set(source.file, source);
  }
  return [...sources.values()];
};

const sourceIdFromPath = (file) =>
  file
    .replace(/\.org$/, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

const sourceTitleFromPath = (file) =>
  file
    .split("/")
    .pop()
    .replace(/\.org$/, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

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

const agendaSettings = (raw) => {
  const start = readDate(raw, "start") ?? todayDate();
  const days = clampWholeNumber(readNumber(raw, "days", 7), 1, 31);
  const end = addDays(start, days - 1);
  return {
    start,
    end,
    days,
    label: agendaRangeLabel(start, end),
    limit: readOptionalWholeNumber(raw, "limit"),
    mode: readAgendaMode(raw?.mode, "classic"),
  };
};

const sourcePlanningAgendaRange = (records, configuredRange) => {
  const dates = records.flatMap((record) =>
    ["scheduled", "deadline", "closed"].flatMap((key) => planningDates(record.planning?.[key])),
  );
  if (dates.length === 0) {
    return null;
  }
  const start = dates.reduce((left, right) => (compareDate(left, right) <= 0 ? left : right));
  const end = dates.reduce((left, right) => (compareDate(left, right) >= 0 ? left : right));
  return {
    ...configuredRange,
    start,
    end,
    days: daysBetween(start, end) + 1,
    label: agendaRangeLabel(start, end),
  };
};

const planningDates = (value) =>
  typeof value === "string"
    ? [...value.matchAll(/(?:<|\[)(\d{4})-(\d{2})-(\d{2})/g)].map((match) => ({
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
      }))
    : [];

const sameAgendaRange = (left, right) =>
  compareDate(left.start, right.start) === 0 && compareDate(left.end, right.end) === 0;

const agendaRangeLabel = (start, end) =>
  compareDate(start, end) === 0 ? formatDate(start) : `${formatDate(start)} - ${formatDate(end)}`;

const compareDate = (left, right) =>
  dateMs(left) === dateMs(right) ? 0 : dateMs(left) < dateMs(right) ? -1 : 1;

const daysBetween = (start, end) =>
  Math.max(0, Math.round((dateMs(end) - dateMs(start)) / 86_400_000));

const dateMs = (date) => Date.UTC(date.year, date.month - 1, date.day);

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

const normalizePublicPath = (value) => publicSegments(String(value)).join("/");

const publicDirname = (path) => {
  const normalized = normalizePublicPath(path);
  const slash = normalized.lastIndexOf("/");
  return slash === -1 ? "" : normalized.slice(0, slash);
};

const joinPath = (...parts) => parts.flatMap((part) => publicSegments(String(part))).join("/");

const publicSegments = (value) => {
  const segments = value.split("/").filter((segment) => segment.length > 0 && segment !== ".");
  const publicIndex = segments.lastIndexOf("public");
  return publicIndex === -1 ? segments : segments.slice(publicIndex + 1);
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

const formatDate = (date) =>
  `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;

const clampWholeNumber = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(value)));

const readAgendaMode = (value, fallback) =>
  value === "classic" || value === "strict" || value === "auto" || value === "agent"
    ? value
    : fallback;

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
