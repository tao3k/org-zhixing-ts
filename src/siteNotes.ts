import type { OrgizeViewIndexRecordDto } from "orgize/dto";
import type { AgendaSettings } from "./config";
import { noteRecords, type OrgizeDocumentView } from "./model";
import { documentViewFromStaticSource, type StaticSourceProjection } from "./staticSiteData";

export type SiteNoteSource = {
  id: string;
  name: string;
  file: string;
  sourceFile: string;
  document: OrgizeDocumentView;
  html: string;
  records: OrgizeViewIndexRecordDto[];
};

export const siteNoteSources = (
  sources: StaticSourceProjection[],
  agenda: AgendaSettings,
): SiteNoteSource[] =>
  sources
    .map((source) => {
      const document = documentViewFromStaticSource(source, agenda);
      return {
        id: source.id,
        name: source.name,
        file: source.file,
        sourceFile: source.sourceFile,
        document,
        html: source.html,
        records: noteRecords(document),
      };
    })
    .filter((source) => source.records.length > 0);
