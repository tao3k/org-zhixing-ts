import type { OrgizeAttachmentInventoryResponseDto } from "orgize/dto";
import type { AttachmentDisplayRecord, OrgizeDocumentView } from "./model";

type PublicAttachmentRecord = AttachmentDisplayRecord & { publicExists?: boolean };

type AttachmentSourceProjection = {
  id: string;
  name: string;
  sourceFile: string;
  attachmentInventory: OrgizeAttachmentInventoryResponseDto;
};

export type AttachmentGalleryRecord = {
  record: AttachmentDisplayRecord;
  sourceFile: string | undefined;
  sourceId: string;
  sourceName: string;
};

export type AttachmentGalleryView = {
  records: AttachmentGalleryRecord[];
  entryCount: number;
  sourceCount: number;
  label: string;
  siteWide: boolean;
};

export const attachmentGalleryFromDocument = (
  document: OrgizeDocumentView,
  sourceFile: string | undefined,
): AttachmentGalleryView => {
  const inventory = document.attachmentInventory;
  return {
    records:
      inventory?.display.filter(isImageRecord).map((record) => ({
        record,
        sourceFile,
        sourceId: sourceFile ?? "current",
        sourceName: sourceLabel(sourceFile),
      })) ?? [],
    entryCount: inventory?.entries.length ?? 0,
    sourceCount: 1,
    label: sourceLabel(sourceFile),
    siteWide: false,
  };
};

export const attachmentGalleryFromSources = (
  sources: AttachmentSourceProjection[],
): AttachmentGalleryView => {
  const records = sources.flatMap((source) =>
    source.attachmentInventory.display.filter(isImageRecord).map((record) => ({
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

const sourceLabel = (sourceFile: string | undefined): string =>
  sourceFile?.split("/").pop() ?? "the current Org source";

const isImageRecord = (record: AttachmentDisplayRecord): boolean =>
  record.mediaKind === "image" && (record as PublicAttachmentRecord).publicExists !== false;
