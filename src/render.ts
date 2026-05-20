import type { OrgizeLintFindingDto, OrgizeViewIndexRecordDto } from "orgize/dto";
import type { AgendaPanelKey } from "./agendaTypes";
import type { AgendaModeKey } from "./config";
import { renderAgenda } from "./agendaRender";
import { rewriteAttachmentLinks } from "./attachmentHtmlRewrite";
import { renderAttachmentGallery } from "./attachmentGalleryRender";
import { renderAgentCapture } from "./captureRender";
import { renderAgentMemory } from "./memoryRender";
import { blogArticles, noteRecords, type OrgizeDocumentView, type ViewKey } from "./model";
import { renderOrgRecordCards } from "./recordRender";
import {
  augmentOrgHtmlMetadata,
  matchHeadingRecord,
  normalizeDisplayText,
  sectionRecords,
  sectionTitle,
  type SectionRecord,
} from "./orgHtmlMetadata";

type TimingStats = {
  staticMs?: number;
  parseMs?: number;
  agendaMs?: number;
  captureMs?: number;
  attachmentMs?: number;
  memoryMs?: number;
  lintMs?: number;
  htmlMs?: number;
};

type RenderViewOptions = {
  view: ViewKey;
  document: OrgizeDocumentView | null;
  pendingMessage?: string;
  agendaMode?: AgendaModeKey;
  agendaPanel?: AgendaPanelKey;
  agendaRuleId?: string | null;
  articleHtml?: string;
  articleMessage?: string;
  blogArticleRangeStart?: number | null;
  blogZenMode?: boolean;
  sourceFile?: string;
};

type ArticleTocItem = {
  id: string;
  level: number;
  tags: string[];
  title: string;
};

type PreparedArticle = {
  html: string;
  toc: ArticleTocItem[];
};

export const renderView = ({
  view,
  document,
  pendingMessage = "",
  agendaMode = "classic",
  agendaPanel = "trace",
  agendaRuleId = null,
  articleHtml = "",
  articleMessage = "",
  blogArticleRangeStart = null,
  blogZenMode = false,
  sourceFile,
}: RenderViewOptions): string => {
  if (pendingMessage) {
    return `<div class="empty">${escapeHtml(pendingMessage)}</div>`;
  }
  if (!document) {
    return `<div class="empty">Loading Org parser...</div>`;
  }

  switch (view) {
    case "blog":
      return renderBlogReader(
        document,
        articleHtml,
        articleMessage,
        blogArticleRangeStart,
        blogZenMode,
        sourceFile,
      );
    case "gallery":
      return renderAttachmentGallery(document, sourceFile);
    case "records":
      return renderOrgRecordCards(noteRecords(document), "Notes", {
        articleHtml,
        document,
        sourceFile,
      });
    case "memory":
      return renderAgentMemory(document.agentMemory, {
        articleHtml,
        document,
        sourceFile,
      });
    case "agenda":
      return renderAgenda(document, agendaMode, agendaPanel, agendaRuleId);
    case "capture":
      return renderAgentCapture(document);
    case "diagnostics":
      return document.lint
        ? renderDiagnostics(document.lint)
        : `<div class="empty">Loading lint...</div>`;
  }
};

const renderBlogReader = (
  document: OrgizeDocumentView,
  articleHtml: string,
  articleMessage: string,
  selectedRangeStart: number | null,
  zenMode: boolean,
  sourceFile: string | undefined,
): string => {
  const articles = blogArticles(document);
  const selected =
    articles.find((article) => article.rangeStart === selectedRangeStart) ?? articles[0];
  const selectedArticle = selected
    ? prepareRenderedArticle(articleHtml, selected, document, sourceFile)
    : prepareArticleHtml(articleHtml, document, sourceFile);
  const emptyMessage =
    articleMessage ||
    (articles.length === 0
      ? "No :blog: articles found in this Org source."
      : "Rendering article...");

  return `
    <section class="blog-reader${zenMode ? " is-zen" : ""}" aria-label="Blog reader">
      <header class="blog-reader-bar">
        <div>
          <p class="eyebrow">Blog library</p>
          <h2>${escapeHtml(selected?.title ?? "Org articles")}</h2>
          <p>${escapeHtml(readerSummary(articles.length, document.counts.records, document.counts.agenda))}</p>
        </div>
        <button type="button" class="reader-mode-button" data-blog-zen="${zenMode ? "0" : "1"}" aria-pressed="${zenMode}">
          ${zenMode ? "Library" : "Zen"}
        </button>
      </header>
      <div class="zen-toolbar" aria-label="Zen reader toolbar">
        <span>${escapeHtml(selected?.title ?? "Zen reader")}</span>
        <button type="button" class="reader-mode-button" data-blog-zen="0" aria-pressed="true">Library</button>
      </div>
      ${renderArticleSwitcher(articles, selected?.rangeStart ?? null)}
      <div class="blog-reader-layout">
        ${renderArticleToc(selectedArticle.toc)}
        ${
          selectedArticle.html
            ? `<article class="rendered-html blog-article">${selectedArticle.html}</article>`
            : `<div class="empty blog-article-empty">${escapeHtml(emptyMessage)}</div>`
        }
      </div>
    </section>
  `;
};

const renderArticleSwitcher = (
  articles: OrgizeViewIndexRecordDto[],
  selectedRangeStart: number | null,
): string => {
  if (articles.length === 0) {
    return "";
  }
  return `
    <nav class="article-switcher" aria-label="Articles in this Org source">
      ${articles.map((article) => renderArticleTab(article, article.rangeStart === selectedRangeStart)).join("")}
    </nav>
  `;
};

const renderArticleTab = (article: OrgizeViewIndexRecordDto, active: boolean): string => `
  <button
    type="button"
    class="article-tab${active ? " active" : ""}"
    data-blog-article="${article.rangeStart}"
  >
    <span>${escapeHtml(articleDateLabel(article))}</span>
    <strong>${escapeHtml(article.title)}</strong>
  </button>
`;

const renderArticleToc = (items: ArticleTocItem[]): string => `
  <aside class="blog-toc" aria-label="Table of contents">
    <div class="blog-toc-summary">
      <span>Table of contents</span>
      <strong>${items.length}</strong>
    </div>
    ${
      items.length > 0
        ? `<ol>${items.map(renderTocItem).join("")}</ol>`
        : `<div class="empty blog-toc-empty">This article has no nested headings yet.</div>`
    }
  </aside>
`;

const renderTocItem = (item: ArticleTocItem): string => `
  <li class="toc-level-${Math.min(Math.max(item.level, 1), 6)}">
    <a href="#${escapeHtml(item.id)}">
      <span>${escapeHtml(item.title)}</span>
      ${renderTocTags(item.tags)}
    </a>
  </li>
`;

const renderTocTags = (tags: string[]): string =>
  tags.length > 0
    ? `<span class="toc-tags">${tags.map((tag) => `<em>${escapeHtml(tag)}</em>`).join("")}</span>`
    : "";

const readerSummary = (articleCount: number, recordCount: number, agendaCount: number): string =>
  `${articleCount} posts from the current Org source, with ${recordCount} records and ${agendaCount} agenda signals still available.`;

const articleDateLabel = (article: OrgizeViewIndexRecordDto): string =>
  propertyValue(article, "CLOSED") ??
  propertyValue(article, "DATE") ??
  propertyValue(article, "SCHEDULED") ??
  "Article";

const propertyValue = (record: OrgizeViewIndexRecordDto, key: string): string | null =>
  record.properties.find((property) => property.key.toUpperCase() === key)?.value ?? null;

const prepareRenderedArticle = (
  articleHtml: string,
  article: OrgizeViewIndexRecordDto,
  document: OrgizeDocumentView,
  sourceFile: string | undefined,
): PreparedArticle => {
  if (!articleHtml) {
    return { html: "", toc: [] };
  }
  const parser = new DOMParser();
  const parsed = parser.parseFromString(articleHtml, "text/html");
  const root = parsed.querySelector("main") ?? parsed.body;
  const heading = [...root.querySelectorAll<HTMLHeadingElement>("h1,h2,h3,h4,h5,h6")].find(
    (candidate) => normalizeHeading(candidate.textContent) === normalizeHeading(article.title),
  );
  if (!heading) {
    return prepareArticleHtml(articleHtml, document, sourceFile);
  }
  const level = headingLevel(heading);
  const container = parsed.createElement("div");
  container.append(heading.cloneNode(true));
  let next = heading.nextElementSibling;
  while (next && !(isHeading(next) && headingLevel(next) <= level)) {
    container.append(next.cloneNode(true));
    next = next.nextElementSibling;
  }
  return prepareArticleHtml(container.innerHTML, document, sourceFile);
};

const prepareArticleHtml = (
  html: string,
  document: OrgizeDocumentView,
  sourceFile: string | undefined,
): PreparedArticle => {
  if (!html) {
    return { html: "", toc: [] };
  }
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");
  const body = parsed.body;
  const headings = [...body.querySelectorAll<HTMLHeadingElement>("h1,h2,h3,h4,h5,h6")];
  const firstHeading = headings[0] ?? null;
  const toc: ArticleTocItem[] = [];
  const usedIds = new Set<string>();
  const records = sectionRecords(document);
  const usedRecords = new Set<SectionRecord>();

  for (const heading of headings) {
    const record = matchHeadingRecord(heading, records, usedRecords);
    if (record) {
      usedRecords.add(record);
    }
    const title = tocHeadingTitle(heading, record);
    if (!title) {
      continue;
    }
    const id = uniqueHeadingId(title, usedIds);
    heading.id = id;
    if (heading !== firstHeading) {
      toc.push({ id, level: headingLevel(heading), tags: tocHeadingTags(record), title });
    }
  }
  rewriteAttachmentLinks(body, document, sourceFile);
  augmentOrgHtmlMetadata(body, document);
  return { html: body.innerHTML, toc };
};

const tocHeadingTitle = (heading: HTMLHeadingElement, record: SectionRecord | null): string =>
  normalizeDisplayText(
    record ? sectionTitle(record) : stripOrgHeadingTags(heading.textContent ?? ""),
  );

const tocHeadingTags = (record: SectionRecord | null): string[] => [
  ...new Set((record?.tags.length ? record.tags : (record?.effectiveTags ?? [])).filter(Boolean)),
];

const stripOrgHeadingTags = (value: string): string =>
  value.replace(/\s+(:[A-Za-z0-9_@#%]+)+:\s*$/, "");

export const renderStats = (
  document: OrgizeDocumentView | null,
  timings: TimingStats = {},
  showPerformance = true,
): string => {
  if (!document) {
    return "No document";
  }
  const lintCount = document.lint?.length;
  const timingText = showPerformance
    ? [
        timings.staticMs === undefined ? null : `static ${formatMs(timings.staticMs)}`,
        timings.parseMs === undefined ? null : `parse ${formatMs(timings.parseMs)}`,
        timings.agendaMs === undefined ? null : `agenda ${formatMs(timings.agendaMs)}`,
        timings.attachmentMs === undefined ? null : `attachments ${formatMs(timings.attachmentMs)}`,
        timings.memoryMs === undefined ? null : `memory ${formatMs(timings.memoryMs)}`,
        timings.captureMs === undefined ? null : `capture ${formatMs(timings.captureMs)}`,
        timings.lintMs === undefined ? null : `lint ${formatMs(timings.lintMs)}`,
        timings.htmlMs === undefined ? null : `html ${formatMs(timings.htmlMs)}`,
      ]
        .filter(Boolean)
        .join(" / ")
    : "";
  const lintText = lintCount === undefined ? "lint lazy" : `${lintCount} lint`;
  return [
    `${document.counts.blog} blog`,
    `${document.counts.attachments} attachments`,
    `${document.counts.records} records`,
    `${document.counts.memory} memory`,
    `${document.counts.agenda} agenda`,
    lintText,
    timingText,
  ]
    .filter(Boolean)
    .join(" / ");
};

const renderDiagnostics = (findings: OrgizeLintFindingDto[]): string => {
  if (findings.length === 0) {
    return `<div class="empty">No lint findings.</div>`;
  }
  return `<ol class="diagnostics">${findings
    .map(
      (finding) => `
        <li>
          <strong>${escapeHtml(finding.code)}</strong>
          <span>${escapeHtml(finding.severity)}</span>
          <p>${escapeHtml(finding.message)}</p>
        </li>
      `,
    )
    .join("")}</ol>`;
};

const isHeading = (element: Element): boolean => /^H[1-6]$/.test(element.tagName);

const headingLevel = (element: Element): number => Number(element.tagName.replace("H", "")) || 1;

const normalizeHeading = (value: string | null): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

const uniqueHeadingId = (title: string, usedIds: Set<string>): string => {
  const base = slugify(title) || "section";
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix++}`;
  }
  usedIds.add(candidate);
  return candidate;
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");

const escapeHtml = (value: string | number): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatMs = (value: number): string => {
  if (value < 10) {
    return `${value.toFixed(1)}ms`;
  }
  return `${Math.round(value)}ms`;
};
