import { isStaticSourceProjection, type StaticSiteData } from "./staticSiteData";
import { createTravelViewFromSources, type TravelView } from "./travelModel";

const travelViewCache = new WeakMap<StaticSiteData, TravelView>();

export const travelViewFromStaticSite = (staticSite: StaticSiteData): TravelView => {
  if (staticSite.travel) {
    return staticSite.travel;
  }
  const cached = travelViewCache.get(staticSite);
  if (cached) {
    return cached;
  }
  const travel = createTravelViewFromSources(
    staticSite.sources.filter(isStaticSourceProjection).map((source) => ({
      records: source.sectionIndex?.records ?? [],
      sourceFile: source.sourceFile,
      sourceName: source.name,
    })),
  );
  travelViewCache.set(staticSite, travel);
  return travel;
};
