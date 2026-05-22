import type { OrgizeMemoryRecordDto, OrgizeViewIndexRecordDto } from "orgize/dto";
import { rewriteAttachmentLinks } from "./attachmentHtmlRewrite";
import { applyHtmlEmbedPolicy } from "./htmlEmbedPolicy";
import { type OrgizeDocumentView } from "./model";
import {
  augmentOrgHtmlMetadata,
  matchHeadingRecord,
  normalizeDisplayText,
  sectionRecords,
  sectionTitle,
  type SectionRecord,
} from "./orgHtmlMetadata";
import type { SiteNoteSource } from "./siteNotes";

export type OrgRecordRenderContext = {
  articleHtml: string;
  document: OrgizeDocumentView;
  sourceFile?: string;
};

export type RenderedOrgRecord = {
  bodyHtml: string;
  rangeStart: number;
  title: string;
};

export type OrgRecordRenderer = {
  rendered: ReadonlyMap<number, RenderedOrgRecord>;
  semantic: ReadonlyMap<number, SectionRecord>;
};

type OrgRecordLike = {
  bodyPreview?: string;
  effectiveTags: string[];
  outline?: string;
  properties: { key: string; value: string }[];
  rangeStart: number;
  title: string;
};

export const renderOrgRecordCards = (
  records: OrgizeViewIndexRecordDto[],
  label: string,
  context: OrgRecordRenderContext,
): string => {
  if (records.length === 0) {
    return `<div class="empty">No ${label.toLowerCase()} records found.</div>`;
  }
  const renderer = createOrgRecordRenderer(context);
  return `
    <section class="org-record-workbench" aria-label="${escapeHtml(label)}">
      <header class="org-record-header">
        <div>
          <p class="eyebrow">Org notes</p>
          <h2>${escapeHtml(label)}</h2>
          <p>${escapeHtml(notesRecordSummary(records, context.sourceFile))}</p>
        </div>
      </header>
      <div class="card-grid">${records.map((record) => renderOrgRecordCard(record, renderer)).join("")}</div>
    </section>
  `;
};

export const renderSiteOrgRecordCards = (sources: SiteNoteSource[]): string => {
  const total = sources.reduce((sum, source) => sum + source.records.length, 0);
  if (total === 0) {
    return `<div class="empty">No Notes records found in the configured Org sources.</div>`;
  }
  return `
    <section class="org-record-workbench" aria-label="Notes">
      <header class="org-record-header">
        <div>
          <p class="eyebrow">Org notes</p>
          <h2>Notes</h2>
          <p>${escapeHtml(siteNotesSummary(total, sources.length))}</p>
        </div>
      </header>
      <div class="org-note-policy">
        <span>:record:</span>
        <span>:ATTACH:</span>
        <span>attachment-backed headings</span>
      </div>
      ${sources.map(renderSiteNoteSource).join("")}
    </section>
  `;
};

export const renderMemoryRecordArticle = (
  record: OrgizeMemoryRecordDto,
  renderer: OrgRecordRenderer,
): string | null => {
  const rendered = renderer.rendered.get(record.source.rangeStart);
  if (!rendered?.bodyHtml) {
    return renderMissingProjection(record.source.rangeStart);
  }
  return `
    <section class="org-record-render org-record-render--memory rendered-html" aria-label="Rendered Org memory">
      ${rendered.bodyHtml}
    </section>
  `;
};

export const createOrgRecordRenderer = (context: OrgRecordRenderContext): OrgRecordRenderer => ({
  rendered: renderedOrgRecords(context),
  semantic: semanticRecordsByRangeStart(context.document),
});

export const orgRecordDisplayTitle = (
  renderer: OrgRecordRenderer,
  rangeStart: number,
  fallbackTitle: string,
): string =>
  renderer.rendered.get(rangeStart)?.title ||
  sectionTitleForRange(renderer, rangeStart) ||
  orgTitleText(fallbackTitle);

export const renderedOrgRecords = (
  context: OrgRecordRenderContext,
): ReadonlyMap<number, RenderedOrgRecord> => {
  if (!context.articleHtml || typeof DOMParser === "undefined") {
    return new Map();
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(context.articleHtml, "text/html");
  const root = parsed.querySelector("main") ?? parsed.body;
  const records = sectionRecords(context.document);
  const used = new Set<SectionRecord>();
  const rendered = new Map<number, RenderedOrgRecord>();

  for (const heading of root.querySelectorAll<HTMLHeadingElement>("h1,h2,h3,h4,h5,h6")) {
    const record = matchHeadingRecord(heading, records, used);
    if (!record) {
      continue;
    }
    used.add(record);
    const section = cloneSection(heading, parsed);
    rewriteAttachmentLinks(section, context.document, context.sourceFile);
    applyHtmlEmbedPolicy(section);
    augmentOrgHtmlMetadata(section, context.document);
    section.querySelector("h1,h2,h3,h4,h5,h6")?.remove();
    rendered.set(record.source.rangeStart, {
      bodyHtml: section.innerHTML.trim(),
      rangeStart: record.source.rangeStart,
      title: sectionTitle(record),
    });
  }

  return rendered;
};

const renderOrgRecordCard = (
  record: OrgizeViewIndexRecordDto,
  renderer: OrgRecordRenderer,
): string => {
  const rendered = renderer.rendered.get(record.rangeStart);
  const bodyHtml = rendered?.bodyHtml;
  const semanticRecord = renderer.semantic.get(record.rangeStart);
  const footer = bodyHtml ? "" : `${renderTags(record)}${renderProperties(record)}`;
  return `
    <article class="card org-record-card">
      <div class="card-kicker">${escapeHtml(recordOutlineText(record, semanticRecord))}</div>
      <h2>${escapeHtml(recordDisplayTitle(record, renderer))}</h2>
      ${
        bodyHtml
          ? `<section class="org-record-render rendered-html">${bodyHtml}</section>`
          : renderMissingProjection(record.rangeStart)
      }
      ${footer}
    </article>
`;
};

const renderSiteNoteSource = (source: SiteNoteSource): string => {
  const renderer = createOrgRecordRenderer({
    articleHtml: source.html,
    document: source.document,
    sourceFile: source.sourceFile,
  });
  return `
    <section class="org-record-source-group">
      <header>
        <div>
          <h3>${escapeHtml(source.name)}</h3>
          <p>${escapeHtml(source.file)} / ${source.records.length} notes</p>
        </div>
      </header>
      <div class="card-grid">
        ${source.records.map((record) => renderOrgRecordCard(record, renderer)).join("")}
      </div>
    </section>
  `;
};

const semanticRecordsByRangeStart = (
  document: OrgizeDocumentView,
): ReadonlyMap<number, SectionRecord> =>
  new Map(sectionRecords(document).map((record) => [record.source.rangeStart, record]));

const renderMissingProjection = (rangeStart: number): string => `
  <section class="org-record-render org-record-render--missing" data-range-start="${rangeStart}">
    <p>HTML projection missing for this Org section.</p>
  </section>
`;

const sectionTitleForRange = (renderer: OrgRecordRenderer, rangeStart: number): string | null => {
  const record = renderer.semantic.get(rangeStart);
  if (!record) {
    return null;
  }
  return sectionTitle(record);
};

const recordDisplayTitle = (
  record: OrgizeViewIndexRecordDto,
  renderer: OrgRecordRenderer,
): string => orgRecordDisplayTitle(renderer, record.rangeStart, record.title);

const recordOutlineText = (
  record: OrgizeViewIndexRecordDto,
  semantic: SectionRecord | undefined,
): string => {
  const semanticPath = semantic?.outlinePathText?.map(normalizeDisplayText).filter(Boolean);
  if (semanticPath && semanticPath.length > 0) {
    return semanticPath.join(" / ");
  }
  return orgTitleText(record.outline || record.title);
};

const cloneSection = (heading: HTMLHeadingElement, parsed: Document): HTMLElement => {
  const container = parsed.createElement("div");
  const level = headingLevel(heading);
  container.append(heading.cloneNode(true));
  let next = heading.nextElementSibling;
  while (next && !(isHeading(next) && headingLevel(next) <= level)) {
    container.append(next.cloneNode(true));
    next = next.nextElementSibling;
  }
  return container;
};

const renderProperties = (record: OrgRecordLike): string => {
  const visible = record.properties.slice(0, 4);
  if (visible.length === 0) {
    return "";
  }
  return `<dl class="properties">${visible
    .map(
      (property) =>
        `<div><dt>${escapeHtml(property.key)}</dt><dd>${escapeHtml(property.value)}</dd></div>`,
    )
    .join("")}</dl>`;
};

const renderTags = (record: OrgRecordLike): string => {
  if (record.effectiveTags.length === 0) {
    return "";
  }
  return `
    <div class="meta-row">
      ${record.effectiveTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
    </div>
  `;
};

const notesRecordSummary = (
  records: OrgizeViewIndexRecordDto[],
  sourceFile: string | undefined,
): string => {
  const plural = records.length === 1 ? "heading" : "headings";
  const source = sourceFile ? sourceFile.split("/").filter(Boolean).pop() : null;
  return `${records.length} ${notesScope(records)} ${plural} from ${source ?? "Org source"}`;
};

const siteNotesSummary = (records: number, sources: number): string =>
  `${records} indexed notes from ${sources} Org sources`;

const notesScope = (records: OrgizeViewIndexRecordDto[]): string => {
  if (records.some((record) => hasTag(record, "record"))) {
    return "explicit :record:";
  }
  if (records.some((record) => hasTag(record, "attach"))) {
    return "attachment-backed";
  }
  return "semantic";
};

const hasTag = (record: OrgizeViewIndexRecordDto, tag: string): boolean =>
  record.effectiveTags.some((value) => value.toLowerCase() === tag);

const orgTitleText = (value: string): string =>
  normalizeDisplayText(
    value.replace(/\[\[([^\]]+)\]\[([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1"),
  );

const isHeading = (element: Element): boolean => /^H[1-6]$/.test(element.tagName);

const headingLevel = (element: Element): number => Number(element.tagName.replace("H", "")) || 1;

const escapeHtml = (value: string | number): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
