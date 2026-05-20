import type { OrgizeMemoryRecordDto, OrgizeViewIndexRecordDto } from "orgize/dto";
import { rewriteAttachmentLinks } from "./attachmentHtmlRewrite";
import { type OrgizeDocumentView } from "./model";
import {
  augmentOrgHtmlMetadata,
  matchHeadingRecord,
  normalizeDisplayText,
  sectionRecords,
  sectionTitle,
  type SectionRecord,
} from "./orgHtmlMetadata";

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
  const rendered = renderedOrgRecords(context);
  const semantic = semanticRecordsByRangeStart(context.document);
  return `<div class="card-grid">${records.map((record) => renderOrgRecordCard(record, rendered, semantic)).join("")}</div>`;
};

export const renderMemoryRecordArticle = (
  record: OrgizeMemoryRecordDto,
  context: OrgRecordRenderContext,
): string | null => {
  const rendered = renderedOrgRecords(context).get(record.source.rangeStart);
  const semantic = semanticRecordsByRangeStart(context.document).get(record.source.rangeStart);
  const sourceFallback = renderSourceBackedBody(semantic, rendered?.bodyHtml ?? "");
  if (!rendered?.bodyHtml) {
    return sourceFallback;
  }
  return `
    <section class="org-record-render org-record-render--memory rendered-html" aria-label="Rendered Org memory">
      ${rendered.bodyHtml}
      ${sourceFallback ?? ""}
    </section>
  `;
};

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
  rendered: ReadonlyMap<number, RenderedOrgRecord>,
  semantic: ReadonlyMap<number, SectionRecord>,
): string => {
  const bodyHtml = rendered.get(record.rangeStart)?.bodyHtml;
  const sourceFallback = renderSourceBackedBody(semantic.get(record.rangeStart), bodyHtml ?? "");
  return `
    <article class="card org-record-card">
      <div class="card-kicker">${escapeHtml(record.outline)}</div>
      <h2>${escapeHtml(recordDisplayTitle(record, rendered))}</h2>
      ${
        bodyHtml
          ? `<section class="org-record-render rendered-html">${bodyHtml}${sourceFallback ?? ""}</section>`
          : (sourceFallback ?? `<p>${escapeHtml(record.bodyPreview)}</p>`)
      }
      <div class="meta-row">
        ${record.effectiveTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
      </div>
      ${renderProperties(record)}
    </article>
`;
};

const semanticRecordsByRangeStart = (
  document: OrgizeDocumentView,
): ReadonlyMap<number, SectionRecord> =>
  new Map(sectionRecords(document).map((record) => [record.source.rangeStart, record]));

const renderSourceBackedBody = (
  record: SectionRecord | undefined,
  renderedHtml: string,
): string | null => {
  const sourceText = recordSourceText(record);
  if (!sourceText) {
    return null;
  }
  const metadataLines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^#\+[A-Z0-9_]+:/.test(line));
  if (metadataLines.length > 0) {
    return `
      <div class="org-record-source-meta">
        <span>Source metadata</span>
        <pre>${escapeHtml(metadataLines.join("\n"))}</pre>
      </div>
    `;
  }
  if (renderedHtml.trim()) {
    return null;
  }
  return `
    <section class="org-record-render org-record-render--source rendered-html">
      <pre>${escapeHtml(sourceText)}</pre>
    </section>
  `;
};

const recordSourceText = (record: SectionRecord | undefined): string =>
  record?.body
    .map((slice) => slice.text.trim())
    .filter(Boolean)
    .join("\n\n") ?? "";

const recordDisplayTitle = (
  record: OrgizeViewIndexRecordDto,
  rendered: ReadonlyMap<number, RenderedOrgRecord>,
): string => rendered.get(record.rangeStart)?.title || orgTitleText(record.title);

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
