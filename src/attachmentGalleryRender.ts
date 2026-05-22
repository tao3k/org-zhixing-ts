import { attachmentPublicUrl, basename } from "./attachmentPaths";
import type { AttachmentGalleryRecord, AttachmentGalleryView } from "./attachmentGalleryModel";
import type { AttachmentDisplayRecord } from "./model";

export const renderAttachmentGallery = (gallery: AttachmentGalleryView | null): string => {
  if (!gallery) {
    return `<div class="empty">Loading attachment gallery...</div>`;
  }
  const { records } = gallery;
  if (records.length === 0) {
    return `
      <section class="attachment-gallery" aria-label="Attachment gallery">
        ${renderAttachmentGalleryHeader(gallery)}
        <div class="empty">${escapeHtml(emptyMessage(gallery))}</div>
      </section>
    `;
  }
  return `
    <section class="attachment-gallery" aria-label="Attachment gallery">
      ${renderAttachmentGalleryHeader(gallery)}
      <div class="attachment-grid">
        ${records.map((record, index) => renderAttachmentCard(record, index)).join("")}
      </div>
    </section>
  `;
};

const renderAttachmentGalleryHeader = (gallery: AttachmentGalleryView): string => `
  <header class="attachment-gallery-header">
    <div>
      <p class="eyebrow">Org attachments</p>
      <h2>Attachment gallery</h2>
      <p>${escapeHtml(gallerySummary(gallery))}</p>
    </div>
    <dl class="attachment-metrics" aria-label="Attachment gallery metrics">
      <div><dt>Display</dt><dd>${gallery.records.length}</dd></div>
      <div><dt>Images</dt><dd>${gallery.records.length}</dd></div>
      <div><dt>Records</dt><dd>${gallery.entryCount}</dd></div>
      <div><dt>Sources</dt><dd>${gallery.sourceCount}</dd></div>
    </dl>
  </header>
`;

const renderAttachmentCard = (
  { record, sourceFile, sourceName }: AttachmentGalleryRecord,
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
          <p>${escapeHtml(`${sourceName} / ${outline}`)}</p>
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

const gallerySummary = (gallery: AttachmentGalleryView): string => {
  const scope = gallery.siteWide ? `across ${gallery.label}` : `in ${gallery.label}`;
  return `${gallery.records.length} image items from ${gallery.entryCount} semantic attachment records ${scope}.`;
};

const emptyMessage = (gallery: AttachmentGalleryView): string =>
  gallery.siteWide
    ? "No image attachments found in configured Org sources."
    : "No image attachments found in this Org source.";

const escapeHtml = (value: string | number): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
