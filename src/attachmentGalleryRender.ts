import { attachmentPublicUrl, basename } from "./attachmentPaths";
import {
  attachmentDisplayRecords,
  type AttachmentDisplayRecord,
  type OrgizeDocumentView,
} from "./model";

export const renderAttachmentGallery = (
  document: OrgizeDocumentView,
  sourceFile: string | undefined,
): string => {
  const inventory = document.attachmentInventory;
  if (!inventory) {
    return `<div class="empty">Loading attachment gallery...</div>`;
  }
  const records = attachmentDisplayRecords(document);
  if (records.length === 0) {
    return `
      <section class="attachment-gallery" aria-label="Attachment gallery">
      ${renderAttachmentGalleryHeader(0, 0, inventory.entries.length, sourceFile)}
        <div class="empty">No attachment-backed media found in this Org source.</div>
      </section>
    `;
  }
  const imageCount = records.filter((record) => record.mediaKind === "image").length;
  return `
    <section class="attachment-gallery" aria-label="Attachment gallery">
      ${renderAttachmentGalleryHeader(records.length, imageCount, inventory.entries.length, sourceFile)}
      <div class="attachment-grid">
        ${records.map((record, index) => renderAttachmentCard(record, sourceFile, index)).join("")}
      </div>
    </section>
  `;
};

const renderAttachmentGalleryHeader = (
  displayCount: number,
  imageCount: number,
  entryCount: number,
  sourceFile: string | undefined,
): string => `
  <header class="attachment-gallery-header">
    <div>
      <p class="eyebrow">Org attachments</p>
      <h2>Attachment gallery</h2>
      <p>${escapeHtml(
        `${displayCount} display items from ${entryCount} semantic attachment records in ${sourceLabel(sourceFile)}; ${imageCount} are image media.`,
      )}</p>
    </div>
    <dl class="attachment-metrics" aria-label="Attachment gallery metrics">
      <div><dt>Display</dt><dd>${displayCount}</dd></div>
      <div><dt>Images</dt><dd>${imageCount}</dd></div>
      <div><dt>Sources</dt><dd>${entryCount}</dd></div>
    </dl>
  </header>
`;

const renderAttachmentCard = (
  record: AttachmentDisplayRecord,
  sourceFile: string | undefined,
  index: number,
): string => {
  const title = attachmentSectionTitle(record) || basename(record.linkPath) || "Attachment";
  const outline = attachmentOutlinePath(record).join(" / ") || record.directoryPath;
  const url = attachmentPublicUrl(record, sourceFile);
  const tags = [...new Set(record.effectiveTags)].slice(0, 5);
  return `
    <article class="attachment-card">
      <a
        href="${escapeHtml(url)}"
        data-attachment-open
        data-attachment-index="${index}"
        data-attachment-kind="${escapeHtml(record.mediaKind)}"
        data-attachment-title="${escapeHtml(title)}"
        data-attachment-outline="${escapeHtml(outline)}"
        data-cropped="true"
        target="_blank"
        rel="noreferrer"
      >
        ${renderAttachmentMedia(record, url, title)}
        <div class="attachment-card-body">
          <span>${escapeHtml(record.mediaKind)}</span>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(outline)}</p>
          <div class="meta-row">
            ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
          </div>
        </div>
      </a>
    </article>
  `;
};

const renderAttachmentMedia = (
  record: AttachmentDisplayRecord,
  url: string,
  title: string,
): string =>
  record.mediaKind === "image"
    ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" data-attachment-thumbnail>`
    : `<div class="attachment-file-preview">${escapeHtml(record.mediaKind.toUpperCase())}</div>`;

const attachmentSectionTitle = (record: AttachmentDisplayRecord): string => {
  const display = record as AttachmentDisplayRecord & { sectionTitleText?: string };
  return display.sectionTitleText ?? record.sectionTitle;
};

const attachmentOutlinePath = (record: AttachmentDisplayRecord): string[] => {
  const display = record as AttachmentDisplayRecord & { outlinePathText?: string[] };
  return display.outlinePathText ?? record.outlinePath;
};

const sourceLabel = (sourceFile: string | undefined): string =>
  sourceFile?.split("/").pop() ?? "the current Org source";

const escapeHtml = (value: string | number): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
