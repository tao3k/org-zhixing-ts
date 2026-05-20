import type { OrgizePropertyDto, OrgizeSectionIndexRecordDto } from "orgize/dto";
import type { OrgizeDocumentView } from "./model";

export type SectionRecord = OrgizeSectionIndexRecordDto & {
  outlinePathText?: string[];
  titleText?: string;
};

type PlanningEntry = {
  label: "SCHEDULED" | "DEADLINE" | "CLOSED";
  value: string;
};

export const augmentOrgHtmlMetadata = (root: ParentNode, document: OrgizeDocumentView): void => {
  const records = sectionRecords(document);
  if (records.length === 0) {
    return;
  }
  const used = new Set<SectionRecord>();
  for (const heading of root.querySelectorAll<HTMLHeadingElement>("h1,h2,h3,h4,h5,h6")) {
    const record = matchHeadingRecord(heading, records, used);
    if (!record || !hasVisibleMetadata(record)) {
      continue;
    }
    used.add(record);
    removeRawPlanningParagraph(heading);
    heading.insertAdjacentElement("afterend", renderSectionMetadata(record));
  }
};

export const sectionRecords = (document: OrgizeDocumentView): SectionRecord[] =>
  document.semanticSections.map((record) => record as SectionRecord);

export const matchHeadingRecord = (
  heading: HTMLHeadingElement,
  records: SectionRecord[],
  used: Set<SectionRecord>,
): SectionRecord | null => {
  const headingText = normalizeDisplayText(heading.textContent ?? "");
  const level = headingLevel(heading);
  const textMatched =
    headingText.length > 0
      ? (records.find(
          (record) =>
            !used.has(record) &&
            normalizeDisplayText(sectionTitle(record)) === headingText &&
            level >= Math.min(record.level, 6),
        ) ??
        records.find(
          (record) =>
            !used.has(record) && normalizeDisplayText(sectionTitle(record)) === headingText,
        ))
      : null;
  return (
    textMatched ??
    records.find((record) => !used.has(record) && level >= Math.min(record.level, 6)) ??
    null
  );
};

const renderSectionMetadata = (record: SectionRecord): HTMLElement => {
  const container = document.createElement("div");
  container.className = "org-section-meta";
  container.append(renderPlanning(record), renderTags(record), renderProperties(record));
  return container;
};

const renderPlanning = (record: SectionRecord): HTMLElement => {
  const row = document.createElement("div");
  row.className = "org-meta-row org-meta-row--planning";
  for (const entry of planningEntries(record)) {
    const item = document.createElement("span");
    item.className = `org-meta-chip org-meta-chip--${entry.label.toLowerCase()}`;
    const label = document.createElement("b");
    label.textContent = entry.label;
    item.append(label, document.createTextNode(` ${entry.value}`));
    row.append(item);
  }
  return row;
};

const renderTags = (record: SectionRecord): HTMLElement => {
  const row = document.createElement("div");
  row.className = "org-meta-row org-meta-row--tags";
  for (const tag of record.effectiveTags.filter((value) => value.length > 0).slice(0, 8)) {
    const item = document.createElement("span");
    item.className = "org-meta-tag";
    item.textContent = tag;
    row.append(item);
  }
  return row;
};

const renderProperties = (record: SectionRecord): HTMLElement => {
  const row = document.createElement("dl");
  row.className = "org-meta-row org-meta-row--properties";
  for (const property of visibleProperties(record).slice(0, 6)) {
    const item = document.createElement("div");
    const key = document.createElement("dt");
    const value = document.createElement("dd");
    key.textContent = property.key;
    value.textContent = property.value;
    item.append(key, value);
    row.append(item);
  }
  return row;
};

const hasVisibleMetadata = (record: SectionRecord): boolean =>
  planningEntries(record).length > 0 ||
  record.effectiveTags.length > 0 ||
  visibleProperties(record).length > 0;

const planningEntries = (record: SectionRecord): PlanningEntry[] =>
  [
    planningEntry("SCHEDULED", record.planning.scheduled),
    planningEntry("DEADLINE", record.planning.deadline),
    planningEntry("CLOSED", record.planning.closed),
  ].filter((entry): entry is PlanningEntry => entry !== null);

const planningEntry = (label: PlanningEntry["label"], value: unknown): PlanningEntry | null => {
  const raw =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "raw" in value && typeof value.raw === "string"
        ? value.raw
        : "";
  return raw ? { label, value: raw } : null;
};

const visibleProperties = (record: SectionRecord): OrgizePropertyDto[] =>
  record.properties.filter((property) => property.key.toUpperCase() !== "ID");

const removeRawPlanningParagraph = (heading: HTMLHeadingElement): void => {
  const container = heading.nextElementSibling;
  const paragraph =
    container?.tagName.toLowerCase() === "section"
      ? container.querySelector("p:first-child")
      : container;
  if (!paragraph || paragraph.tagName.toLowerCase() !== "p") {
    return;
  }
  if (/^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(paragraph.textContent ?? "")) {
    paragraph.remove();
  }
};

export const sectionTitle = (record: SectionRecord): string =>
  record.titleText ?? orgTitleText(record.title);

const orgTitleText = (value: string): string =>
  value.replace(/\[\[([^\]]+)\]\[([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1");

export const normalizeDisplayText = (value: string): string =>
  value
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();

export const headingLevel = (heading: HTMLHeadingElement): number =>
  Number(heading.tagName.replace(/^H/i, "")) || 1;
