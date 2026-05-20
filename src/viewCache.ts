import { blogCacheKey, type BlogReaderState } from "./blogState";
import type { AgendaModeKey, SourceItem } from "./config";
import type { OrgizeDocumentView, ViewKey } from "./model";

type ViewCacheKeyInput = {
  agendaMode: AgendaModeKey;
  agendaPanel: string;
  agendaRuleId: string | null;
  blog: BlogReaderState;
  document: OrgizeDocumentView | null;
  renderedHtml: string;
  sourceItem: SourceItem | null;
  view: ViewKey;
};

export const viewCacheKey = ({
  agendaMode,
  agendaPanel,
  agendaRuleId,
  blog,
  document,
  renderedHtml,
  sourceItem,
  view,
}: ViewCacheKeyInput): string => {
  const sourceKey = sourceItem?.file ?? "runtime";
  const attachmentKey = document?.attachmentInventory
    ? `attachments:${document.attachmentInventory.display.length}:${document.attachmentInventory.entries.length}`
    : "attachments:pending";
  const htmlKey = renderedHtml ? "html:ready" : "html:pending";
  const memoryKey = document?.agentMemory ? "memory:ready" : "memory:pending";

  switch (view) {
    case "blog":
      return `${sourceKey}:${htmlKey}:${attachmentKey}:${blogCacheKey(blog)}`;
    case "records":
      return `${sourceKey}:records:${htmlKey}:${attachmentKey}`;
    case "memory":
      return `${sourceKey}:memory:${memoryKey}:${htmlKey}:${attachmentKey}`;
    case "gallery":
      return `${sourceKey}:gallery:${attachmentKey}`;
    case "agenda":
      return `${sourceKey}:agenda:${agendaMode}:${agendaPanel}:${agendaRuleId ?? ""}`;
    default:
      return `${sourceKey}:${view}`;
  }
};
