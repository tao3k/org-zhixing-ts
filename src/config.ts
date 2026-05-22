import { parse } from "smol-toml";
import type { OrgizeAgendaViewJsonRequestDto } from "orgize/dto";
import type { ViewKey } from "./model";

export type SiteConfig = {
  title: string;
  locale: string;
  contentRoot: string;
  defaultSourceId: string | null;
  defaultView: ViewKey;
  agenda: AgendaSettings;
  attachments: AttachmentSettings;
  behavior: SiteBehavior;
  menu: MenuItem[];
  sources: SourceItem[];
};

export type AgendaDate = OrgizeAgendaViewJsonRequestDto["start"];

export type AgendaSettings = {
  start: AgendaDate;
  end: AgendaDate;
  days: number;
  limit: number | null;
  label: string;
  mode: AgendaModeKey;
};

export type AgendaModeKey = "classic" | "strict" | "auto" | "agent";

export type AttachmentSettings = {
  attachIdDir: string;
  checkVcs: boolean;
  checkAnnex: boolean;
  scanOrphans: boolean;
};

export type MenuItem = {
  name: string;
  view: ViewKey;
  weight: number;
};

export type SourceItem = {
  id: string;
  name: string;
  file: string;
  sourceFile: string;
};

export type SiteBehavior = {
  showPerformance: boolean;
  lazyLint: boolean;
};

type TomlRecord = Record<string, unknown>;

const defaultContentDir = "blog";
const defaultSourcePath = "org-zhixing-demo.org";
const defaultSourceId = "demo";

export const loadSiteConfig = async (): Promise<SiteConfig> => {
  const configPath = configPathFromUrl();
  const response = await fetch(publicAssetUrl(configPath), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`failed to load ${configPath}: HTTP ${response.status}`);
  }
  return parseSiteConfig(await response.text());
};

export const publicAssetUrl = (path: string): URL =>
  new URL(stripLeadingSlash(path), publicRootUrl());

export const resolveInitialView = (config: SiteConfig): ViewKey => {
  const candidate = new URLSearchParams(window.location.search).get("view");
  return isViewKey(candidate) ? candidate : config.defaultView;
};

export const resolveInitialAgendaMode = (config: SiteConfig): AgendaModeKey => {
  const candidate = new URLSearchParams(window.location.search).get("agenda");
  return agendaModeAlias(candidate) ?? config.agenda.mode;
};

export const resolveInitialSource = (config: SiteConfig): SourceItem => {
  const candidate = new URLSearchParams(window.location.search).get("source");
  if (candidate) {
    return sourceFromUserPath(config, candidate);
  }
  return config.defaultSourceId
    ? sourceFromUserPath(config, config.defaultSourceId)
    : config.sources[0];
};

export const sourceFromUserPath = (config: SiteConfig, path: string): SourceItem => {
  const configured = config.sources.find((source) => source.id === path);
  if (configured) {
    return configured;
  }
  const normalized = normalizeConfiguredPath(path, config.contentRoot);
  return (
    config.sources.find((source) => source.file === normalized) ?? {
      id: normalized,
      name: normalized,
      file: normalized,
      sourceFile: sourceFileFor(config.contentRoot, normalized),
    }
  );
};

export const showPerformanceFromUrl = (fallback: boolean): boolean => {
  const value = new URLSearchParams(window.location.search).get("perf");
  if (value === null) {
    return fallback;
  }
  return value !== "0" && value !== "false";
};

const parseSiteConfig = (source: string): SiteConfig => {
  const raw = asRecord(parse(source));
  const site = asOptionalRecord(raw.site);
  const content = asOptionalRecord(raw.content);
  const ui = asOptionalRecord(raw.ui);
  const agenda = parseAgenda(asOptionalRecord(raw.agenda));
  const behavior = parseBehavior(asOptionalRecord(raw.behavior), ui);
  const contentRoot = normalizeDir(
    readString(content, "content_dir", readString(content, "root", defaultContentDir)),
  );
  const attachments = parseAttachments(asOptionalRecord(raw.attachments), contentRoot);
  const defaultSource = readOptionalString(content, "default_source");
  const sources = parseSources(asOptionalRecord(raw.content)?.sources, contentRoot);

  return {
    title: readString(site, "title", "Org Zhixing"),
    locale: readString(site, "locale", "zh-CN"),
    contentRoot,
    defaultSourceId: defaultSource,
    defaultView: readView(ui?.default_view, "blog"),
    agenda,
    attachments,
    behavior,
    menu: parseMenu(ui?.views),
    sources:
      sources.length > 0
        ? sources
        : [sourceFromPath(contentRoot, defaultSourceId, defaultSourcePath, "Org Zhixing Demo")],
  };
};

const parseBehavior = (raw: TomlRecord | null, ui: TomlRecord | null): SiteBehavior => ({
  showPerformance: readBoolean(ui, "show_timings", true),
  lazyLint: readBoolean(raw, "lazy_lint", true),
});

export const agendaViewRequest = (agenda: AgendaSettings): OrgizeAgendaViewJsonRequestDto => ({
  start: agenda.start,
  end: agenda.end,
  limit: agenda.limit,
});

const parseAgenda = (raw: TomlRecord | null): AgendaSettings => {
  const start = readDate(raw, "start") ?? todayDate();
  const days = clampWholeNumber(readNumber(raw, "days", 7), 1, 31);
  const end = addDays(start, days - 1);
  const limit = readOptionalWholeNumber(raw, "limit");
  return {
    start,
    end,
    days,
    limit,
    label: days === 1 ? formatDate(start) : `${formatDate(start)} - ${formatDate(end)}`,
    mode: readAgendaMode(raw?.mode, "classic"),
  };
};

const parseAttachments = (raw: TomlRecord | null, contentRoot: string): AttachmentSettings => ({
  attachIdDir: normalizeAttachmentDir(readString(raw, "attach_id_dir", ".attach"), contentRoot),
  checkVcs: readBoolean(raw, "check_vcs", false),
  checkAnnex: readBoolean(raw, "check_annex", false),
  scanOrphans: readBoolean(raw, "scan_orphans", false),
});

const parseMenu = (raw: unknown): MenuItem[] => {
  const items = Array.isArray(raw)
    ? raw.map(asRecord).map((item) => ({
        name: readString(item, "label", readView(item.id, "blog")),
        view: readView(item.id, "blog"),
        weight: readNumber(item, "weight", 0),
      }))
    : [];
  return (items.length > 0 ? items : defaultMenu()).sort(
    (left, right) => left.weight - right.weight,
  );
};

const parseSources = (raw: unknown, contentRoot: string): SourceItem[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map(asRecord)
    .map((source) =>
      sourceFromPath(
        contentRoot,
        readString(source, "id", defaultSourceId),
        normalizeConfiguredPath(readString(source, "file", defaultSourcePath), contentRoot),
        readString(source, "title", readString(source, "file", defaultSourcePath)),
      ),
    );
};

const sourceFromPath = (
  contentRoot: string,
  id: string,
  file: string,
  name: string,
): SourceItem => ({
  id,
  name,
  file,
  sourceFile: sourceFileFor(contentRoot, file),
});

const sourceFileFor = (contentRoot: string, file: string): string => `${contentRoot}/${file}`;

const publicRootUrl = (): URL => {
  const assetScript = Array.from(document.scripts).find((script) =>
    script.src ? new URL(script.src).pathname.includes("/assets/") : false,
  );
  if (assetScript?.src) {
    return new URL("../", assetScript.src);
  }
  return new URL(".", document.baseURI);
};

const stripLeadingSlash = (path: string): string => path.replace(/^\/+/, "");

const defaultMenu = (): MenuItem[] => [
  { name: "Blog", view: "blog", weight: 10 },
  { name: "Gallery", view: "gallery", weight: 18 },
  { name: "Notes", view: "records", weight: 20 },
  { name: "Travel", view: "travel", weight: 22 },
  { name: "Memory", view: "memory", weight: 25 },
  { name: "Agenda", view: "agenda", weight: 30 },
];

const configPathFromUrl = (): string => {
  const candidate = new URLSearchParams(window.location.search).get("config");
  if (!candidate) {
    return "org-zhixing.toml";
  }
  if (!candidate.endsWith(".toml") || candidate.includes("/") || candidate.includes("\\")) {
    throw new Error("config must be a root public TOML file");
  }
  return candidate;
};

const normalizeDir = (value: string): string => {
  const normalized = value.replace(/^\/+|\/+$/g, "");
  assertSafePath(normalized);
  return normalized;
};

const normalizeAttachmentDir = (value: string, contentRoot: string): string => {
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

const normalizeConfiguredPath = (value: string, contentDir: string): string => {
  const prefix = `${contentDir}/`;
  const withoutPrefix = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  const normalized = withoutPrefix.replace(/^\/+/, "");
  assertSafePath(normalized);
  if (!normalized.endsWith(".org")) {
    throw new Error(`Org source must end with .org: ${value}`);
  }
  return normalized;
};

const assertSafePath = (value: string): void => {
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

const assertSafeAttachmentPath = (value: string): void => {
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

const readString = (record: TomlRecord | null, key: string, fallback: string): string => {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
};

const readOptionalString = (record: TomlRecord | null, key: string): string | null => {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const readBoolean = (record: TomlRecord | null, key: string, fallback: boolean): boolean => {
  const value = record?.[key];
  return typeof value === "boolean" ? value : fallback;
};

const readNumber = (record: TomlRecord | null, key: string, fallback: number): number => {
  const value = record?.[key];
  return typeof value === "number" ? value : fallback;
};

const readOptionalWholeNumber = (record: TomlRecord | null, key: string): number | null => {
  const value = record?.[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.trunc(value);
};

const readDate = (record: TomlRecord | null, key: string): AgendaDate | null => {
  const value = record?.[key];
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`agenda ${key} must be YYYY-MM-DD`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
};

const todayDate = (): AgendaDate => {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
};

const addDays = (date: AgendaDate, days: number): AgendaDate => {
  const normalized = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: normalized.getUTCFullYear(),
    month: normalized.getUTCMonth() + 1,
    day: normalized.getUTCDate(),
  };
};

const formatDate = (date: AgendaDate): string =>
  `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;

const pad2 = (value: number): string => String(value).padStart(2, "0");

const clampWholeNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.trunc(value)));

const readView = (value: unknown, fallback: ViewKey): ViewKey =>
  isViewKey(value) ? value : fallback;

const readAgendaMode = (value: unknown, fallback: AgendaModeKey): AgendaModeKey =>
  agendaModeAlias(value) ?? fallback;

const isViewKey = (value: unknown): value is ViewKey =>
  value === "blog" ||
  value === "gallery" ||
  value === "records" ||
  value === "memory" ||
  value === "travel" ||
  value === "agenda" ||
  value === "capture" ||
  value === "diagnostics";

const agendaModeAlias = (value: unknown): AgendaModeKey | null => {
  if (value === "classic" || value === "strict" || value === "auto" || value === "agent") {
    return value;
  }
  if (value === "focus") return "classic";
  if (value === "pressure") return "strict";
  if (value === "flow") return "auto";
  return null;
};

const asOptionalRecord = (value: unknown): TomlRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as TomlRecord) : null;

const asRecord = (value: unknown): TomlRecord => asOptionalRecord(value) ?? {};
