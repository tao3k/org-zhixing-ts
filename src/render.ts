import type { OrgizeLintFindingDto } from "orgize/dto";
import type { AgendaPanelKey } from "./agendaTypes";
import type { AgendaModeKey } from "./config";
import { renderAgenda } from "./agendaRender";
import {
  attachmentGalleryFromDocument,
  type AttachmentGalleryView,
} from "./attachmentGalleryModel";
import { renderAttachmentGallery } from "./attachmentGalleryRender";
import { renderBlogReader } from "./blogRender";
import { renderAgentCapture } from "./captureRender";
import { renderAgentMemory } from "./memoryRender";
import { noteRecords, type OrgizeDocumentView, type ViewKey } from "./model";
import { renderOrgRecordCards, renderSiteOrgRecordCards } from "./recordRender";
import { renderTravel } from "./travelRender";
import type { TravelView } from "./travelModel";
import type { StaticBlogIndex } from "./staticSiteData";
import type { SiteNoteSource } from "./siteNotes";

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
  blogIndex?: StaticBlogIndex | null;
  blogTagFilter?: string | null;
  blogTimeFilter?: string | null;
  blogZenMode?: boolean;
  attachmentGallery?: AttachmentGalleryView | null;
  siteNotes?: SiteNoteSource[] | null;
  travelView?: TravelView;
  sourceFile?: string;
};

export const renderView = (options: RenderViewOptions): string => {
  const siteWideHtml = renderSiteWideView(options);
  if (siteWideHtml !== null) {
    return siteWideHtml;
  }
  const pendingMessage = options.pendingMessage ?? "";
  if (pendingMessage) {
    return `<div class="empty">${escapeHtml(pendingMessage)}</div>`;
  }
  if (!options.document) {
    return `<div class="empty">Loading Org parser...</div>`;
  }
  return renderLoadedView({ ...options, document: options.document });
};

const renderSiteWideView = (options: RenderViewOptions): string | null => {
  if (options.view === "blog" && options.blogIndex && !options.blogZenMode) {
    return renderBlogReader({
      document: options.document,
      articleHtml: options.articleHtml ?? "",
      articleMessage: options.articleMessage ?? "",
      blogIndex: options.blogIndex,
      selectedRangeStart: options.blogArticleRangeStart ?? null,
      tagFilter: options.blogTagFilter ?? null,
      timeFilter: options.blogTimeFilter ?? null,
      zenMode: false,
      sourceFile: options.sourceFile,
    });
  }
  if (options.view === "travel" && options.travelView) {
    return renderTravel(
      options.document,
      options.sourceFile,
      options.travelView,
      options.articleHtml,
    );
  }
  if (options.view === "gallery" && options.attachmentGallery !== undefined) {
    return renderAttachmentGallery(options.attachmentGallery ?? null);
  }
  if (options.view === "records" && options.siteNotes !== undefined) {
    return options.siteNotes
      ? renderSiteOrgRecordCards(options.siteNotes)
      : `<div class="empty">Loading static notes...</div>`;
  }
  return null;
};

const renderLoadedView = ({
  view,
  document,
  agendaMode = "classic",
  agendaPanel = "trace",
  agendaRuleId = null,
  articleHtml = "",
  articleMessage = "",
  blogArticleRangeStart = null,
  blogIndex,
  blogTagFilter = null,
  blogTimeFilter = null,
  blogZenMode = false,
  attachmentGallery,
  siteNotes,
  travelView,
  sourceFile,
}: RenderViewOptions & { document: OrgizeDocumentView }): string => {
  switch (view) {
    case "blog":
      return renderBlogReader({
        document,
        articleHtml,
        articleMessage,
        blogIndex,
        selectedRangeStart: blogArticleRangeStart,
        tagFilter: blogTagFilter,
        timeFilter: blogTimeFilter,
        zenMode: blogZenMode,
        sourceFile,
      });
    case "gallery":
      return renderAttachmentGallery(
        attachmentGallery ?? attachmentGalleryFromDocument(document, sourceFile),
      );
    case "records":
      if (siteNotes) {
        return renderSiteOrgRecordCards(siteNotes);
      }
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
    case "travel":
      return renderTravel(document, sourceFile, travelView, articleHtml);
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

export const renderStats = (
  document: OrgizeDocumentView | null,
  timings: TimingStats = {},
  showPerformance = true,
  attachmentGallery?: AttachmentGalleryView,
): string => {
  if (!document) {
    return "No document";
  }
  const lintCount = document.lint?.length;
  const lintText = lintCount === undefined ? "lint lazy" : `${lintCount} lint`;
  return [
    `${document.counts.blog} blog`,
    attachmentStatsText(document, attachmentGallery),
    `${document.counts.records} records`,
    `${document.counts.memory} memory`,
    `${document.counts.agenda} agenda`,
    lintText,
    timingStatsText(timings, showPerformance),
  ]
    .filter(Boolean)
    .join(" / ");
};

const attachmentStatsText = (
  document: OrgizeDocumentView,
  attachmentGallery: AttachmentGalleryView | undefined,
): string =>
  attachmentGallery
    ? `${attachmentGallery.records.length} image attachments`
    : `${document.counts.attachments} attachments`;

const timingStatsText = (timings: TimingStats, showPerformance: boolean): string =>
  showPerformance
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
