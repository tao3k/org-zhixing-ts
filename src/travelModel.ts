import type { OrgizePropertyDto } from "orgize/dto";
import type { OrgizeDocumentView } from "./model";
import {
  normalizeDisplayText,
  sectionRecords,
  sectionTitle,
  type SectionRecord,
} from "./orgHtmlMetadata";

export type TravelCoordinate = {
  lat: number;
  lon: number;
  raw: string;
};

export type GoogleMapsUrl = string & { readonly __brand: "GoogleMapsUrl" };
export type TravelPlaceId = string & { readonly __brand: "TravelPlaceId" };

export type TravelEvidence = {
  label: string;
  value: string;
};

export type TravelSourceLink = {
  kind: "video" | "wiki" | "web";
  label: string;
  url: string;
};

export type TravelPlaceKind = "region" | "place";

export type TravelPlace = {
  id: TravelPlaceId;
  rangeStart: number;
  title: string;
  outline: string;
  sourceFile: string | null;
  sourceName: string | null;
  region: string | null;
  tags: string[];
  kind: TravelPlaceKind;
  coordinates: TravelCoordinate | null;
  query: string;
  googleMapsUrl: GoogleMapsUrl;
  googleMapsEmbedUrl: GoogleMapsUrl;
  sourceLinks: TravelSourceLink[];
  evidence: TravelEvidence[];
  enrichFields: string[];
  needsEnrichment: boolean;
};

export type TravelView = {
  places: TravelPlace[];
  regions: string[];
  scannedSourceCount: number;
  sourceCount: number;
  locatedCount: number;
  enrichCandidateCount: number;
  siteWide: boolean;
};

export type TravelSourceInput = {
  document?: OrgizeDocumentView | null;
  records?: SectionRecord[];
  sourceFile?: string;
  sourceName?: string;
};

export const createTravelView = (
  document: OrgizeDocumentView | null,
  sourceFile?: string,
): TravelView => {
  return createTravelViewFromSources([{ document, sourceFile }], false);
};

export const createTravelViewFromSources = (
  sources: TravelSourceInput[],
  siteWide = true,
): TravelView => {
  const places = sources.flatMap(createTravelPlacesFromSource);
  return summarizeTravelPlaces(places, sources.length, siteWide);
};

export const buildGoogleMapsSearchUrl = (query: string, placeId?: string): GoogleMapsUrl => {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", query);
  if (placeId) {
    url.searchParams.set("query_place_id", placeId);
  }
  return asGoogleMapsUrl(url.toString());
};

export const buildGoogleMapsEmbedUrl = (query: string): GoogleMapsUrl => {
  const url = new URL("https://maps.google.com/maps");
  url.searchParams.set("q", query);
  url.searchParams.set("output", "embed");
  return asGoogleMapsUrl(url.toString());
};

const createTravelPlacesFromSource = ({
  document,
  records,
  sourceFile,
  sourceName,
}: TravelSourceInput): TravelPlace[] => {
  const sourceRecords = records ?? (document ? sectionRecords(document) : []);
  if (sourceRecords.length === 0) {
    return [];
  }
  const travelRecords = sourceRecords.filter(isTravelCandidate);
  let currentRegion: string | null = null;
  const places: TravelPlace[] = [];

  for (const record of travelRecords) {
    const title = sectionTitle(record);
    if (!title) {
      continue;
    }
    const headingRegion = regionFromHeading(title);
    if (headingRegion) {
      currentRegion = headingRegion;
    }
    places.push(createTravelPlace(record, currentRegion, { sourceFile, sourceName }));
  }

  return places;
};

const summarizeTravelPlaces = (
  places: TravelPlace[],
  scannedSourceCount: number,
  siteWide: boolean,
): TravelView => {
  const regions = [...new Set(places.map((place) => place.region).filter(isString))];
  const sourceCount = new Set(
    places.map((place) => place.sourceFile ?? place.sourceName ?? "current"),
  ).size;
  return {
    places,
    regions,
    scannedSourceCount,
    sourceCount: places.length > 0 ? sourceCount : 0,
    locatedCount: places.filter((place) => place.coordinates).length,
    enrichCandidateCount: places.filter((place) => place.needsEnrichment).length,
    siteWide,
  };
};

const createTravelPlace = (
  record: SectionRecord,
  currentRegion: string | null,
  source: { sourceFile?: string; sourceName?: string },
): TravelPlace => {
  const title = sectionTitle(record);
  const headingRegion = regionFromHeading(title);
  const tags = [...new Set(record.effectiveTags.filter(Boolean))];
  const region = regionFromRecord(record) ?? currentRegion;
  const coordinates = coordinatesFromRecord(record);
  const placeId = propertyValue(record, "GOOGLE_PLACE_ID") ?? propertyValue(record, "PLACE_ID");
  const placeHints = placeHintsFromRecord(record);
  const explicitQuery =
    propertyValue(record, "GOOGLE_MAPS_QUERY") ??
    propertyValue(record, "MAPS_QUERY") ??
    propertyValue(record, "LOCATION_QUERY");
  const queryTitle = headingRegion ?? title;
  const query = mapQuery(
    explicitQuery,
    coordinates,
    headingRegion ? [] : placeHints,
    queryTitle,
    region,
  );
  const evidence = evidenceFromRecord(record, coordinates, placeHints);
  const enrichFields = enrichFieldsFor(record, coordinates, region, placeId);

  return {
    id: travelPlaceId(source.sourceFile, record.source.rangeStart),
    rangeStart: record.source.rangeStart,
    title,
    outline: outlineText(record),
    sourceFile: source.sourceFile ?? null,
    sourceName: source.sourceName ?? null,
    region,
    tags,
    kind: travelKind(Boolean(headingRegion)),
    coordinates,
    query,
    googleMapsUrl: buildGoogleMapsSearchUrl(query, placeId ?? undefined),
    googleMapsEmbedUrl: buildGoogleMapsEmbedUrl(query),
    sourceLinks: sourceLinksFromRecord(record),
    evidence,
    enrichFields,
    needsEnrichment: enrichFields.length > 0,
  };
};

const travelPlaceId = (sourceFile: string | undefined, rangeStart: number): TravelPlaceId => {
  const sourceSlug =
    sourceFile
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "current";
  return `${sourceSlug}-${rangeStart}` as TravelPlaceId;
};

const asGoogleMapsUrl = (value: string): GoogleMapsUrl => value as GoogleMapsUrl;

const isTravelCandidate = (record: SectionRecord): boolean => {
  if (record.effectiveTags.some((tag) => tag.toLowerCase() === "travel")) {
    return true;
  }
  if (Boolean(regionFromHeading(sectionTitle(record)) || regionFromRecord(record))) {
    return true;
  }
  return Boolean(coordinatesFromRecord(record) || propertyValue(record, "GOOGLE_MAPS_QUERY"));
};

const regionFromRecord = (record: SectionRecord): string | null => {
  const path = record.outlinePathText ?? record.outlinePath ?? [];
  for (const item of path) {
    const region = regionFromHeading(item);
    if (region) {
      return region;
    }
  }
  return null;
};

const regionFromHeading = (title: string): string | null => {
  const match = /^游山玩水->(.+)$/.exec(normalizeDisplayText(title));
  return match ? match[1].trim() : null;
};

const travelKind = (isRegion: boolean): TravelPlaceKind => {
  if (isRegion) {
    return "region";
  }
  return "place";
};

const mapQuery = (
  explicitQuery: string | null,
  coordinates: TravelCoordinate | null,
  placeHints: string[],
  title: string,
  region: string | null,
): string => {
  if (explicitQuery) {
    return explicitQuery;
  }
  if (coordinates) {
    return `${coordinates.lat},${coordinates.lon}`;
  }
  const place = placeHints[0] ?? title;
  return region && !place.includes(region) ? `${place} ${region}` : place;
};

const coordinatesFromRecord = (record: SectionRecord): TravelCoordinate | null => {
  const lat = propertyValue(record, "GEO_LAT") ?? propertyValue(record, "LATITUDE");
  const lon = propertyValue(record, "GEO_LON") ?? propertyValue(record, "LONGITUDE");
  if (lat && lon) {
    return coordinatePair(Number(lat), Number(lon), `${lat},${lon}`);
  }

  const raw =
    propertyValue(record, "地理坐标") ??
    propertyValue(record, "COORDINATES") ??
    propertyValue(record, "GEO") ??
    propertyValue(record, "LOCATION");
  return raw ? parseCoordinateText(raw) : null;
};

const parseCoordinateText = (raw: string): TravelCoordinate | null => {
  const decimalPair = /(-?\d{1,3}(?:\.\d+)?)\s*[;,]\s*(-?\d{1,3}(?:\.\d+)?)/.exec(raw);
  if (decimalPair) {
    return coordinatePair(Number(decimalPair[1]), Number(decimalPair[2]), raw);
  }
  const degreePair =
    /(-?\d{1,3}(?:\.\d+)?)\s*°?\s*[NS北南]?\s+(-?\d{1,3}(?:\.\d+)?)\s*°?\s*[EW东西]?/.exec(raw);
  if (degreePair) {
    return coordinatePair(Number(degreePair[1]), Number(degreePair[2]), raw);
  }
  return null;
};

const coordinatePair = (lat: number, lon: number, raw: string): TravelCoordinate | null =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { lat, lon, raw }
    : null;

const placeHintsFromRecord = (record: SectionRecord): string[] => {
  return [
    ...new Set(
      recordLinks(record)
        .filter((link) => link.path.startsWith("id:"))
        .map((link) => normalizeDisplayText(link.description))
        .filter(isPlaceHint),
    ),
  ];
};

const isPlaceHint = (value: string): boolean => {
  if (value.length === 0 || value.startsWith("id:")) {
    return false;
  }
  return !/youtube|youtu\.be|视频|日记|合集|播放|episode|vlog/i.test(value);
};

const sourceLinksFromRecord = (record: SectionRecord): TravelSourceLink[] => {
  return [
    ...new Map(
      recordLinks(record)
        .filter((link) => /^https?:\/\//.test(link.path))
        .map((link) => [
          link.path,
          {
            kind: sourceLinkKind(link.path),
            label: normalizeDisplayText(link.description || link.path),
            url: link.path,
          } satisfies TravelSourceLink,
        ]),
    ).values(),
  ];
};

const sourceLinkKind = (url: string): TravelSourceLink["kind"] => {
  if (/youtube\.com|youtu\.be/.test(url)) return "video";
  if (/wikipedia\.org|baike\.baidu\.com/.test(url)) return "wiki";
  return "web";
};

const recordLinks = (record: SectionRecord): Array<{ path: string; description: string }> =>
  (record.links as Array<{ path?: string; description?: string }>)
    .map((link) => ({
      path: link.path ?? "",
      description: link.description ?? link.path ?? "",
    }))
    .filter((link) => link.path.length > 0);

const evidenceFromRecord = (
  record: SectionRecord,
  coordinates: TravelCoordinate | null,
  placeHints: string[],
): TravelEvidence[] => {
  const evidence: TravelEvidence[] = [];
  if (coordinates) {
    evidence.push({ label: "coordinates", value: `${coordinates.lat}, ${coordinates.lon}` });
  }
  for (const hint of placeHints.slice(0, 3)) {
    evidence.push({ label: "place hint", value: hint });
  }
  for (const property of record.properties.filter(isTravelProperty).slice(0, 4)) {
    evidence.push({ label: property.key, value: property.value });
  }
  for (const timestamp of timestampEvidence(record).slice(0, 2)) {
    evidence.push({ label: "captured", value: timestamp });
  }
  return evidence;
};

const isTravelProperty = (property: OrgizePropertyDto): boolean =>
  [
    "地理坐标",
    "URL",
    "wikinfo-id",
    "GOOGLE_MAPS_QUERY",
    "GOOGLE_PLACE_ID",
    "GEO_LAT",
    "GEO_LON",
    "TRAVEL_REGION",
  ].includes(property.key);

const timestampEvidence = (record: SectionRecord): string[] => [
  ...new Set(
    record.body.flatMap((slice) =>
      [...slice.text.matchAll(/\[(\d{4}-\d{2}-\d{2}[^\]]*)\]/g)].map((match) => match[1]),
    ),
  ),
];

const enrichFieldsFor = (
  record: SectionRecord,
  coordinates: TravelCoordinate | null,
  region: string | null,
  placeId: string | null,
): string[] => {
  const fields: string[] = [];
  if (!coordinates) {
    fields.push("GEO_LAT", "GEO_LON");
  }
  if (!propertyValue(record, "GOOGLE_MAPS_QUERY")) {
    fields.push("GOOGLE_MAPS_QUERY");
  }
  if (!placeId) {
    fields.push("GOOGLE_PLACE_ID");
  }
  if (region && !propertyValue(record, "TRAVEL_REGION")) {
    fields.push("TRAVEL_REGION");
  }
  return fields;
};

const propertyValue = (record: SectionRecord, key: string): string | null =>
  record.properties.find((property) => property.key.toUpperCase() === key.toUpperCase())?.value ??
  null;

const outlineText = (record: SectionRecord): string =>
  (record.outlinePathText ?? record.outlinePath ?? [sectionTitle(record)])
    .map(normalizeDisplayText)
    .filter(Boolean)
    .join(" / ");

const isString = (value: string | null): value is string => typeof value === "string";
