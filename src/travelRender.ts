import type { OrgizeDocumentView } from "./model";
import {
  createTravelView,
  type TravelEvidence,
  type TravelPlace,
  type TravelView,
} from "./travelModel";

const virtualListThreshold = 80;

export const renderTravel = (
  document: OrgizeDocumentView | null,
  sourceFile?: string,
  travelView?: TravelView,
): string => {
  const travel = travelView ?? createTravelView(document, sourceFile);
  if (travel.places.length === 0) {
    return `<div class="empty">${travel.siteWide ? "No travel places in indexed Org sources." : "No travel places in this Org source."}</div>`;
  }
  return `
    <section class="travel-workbench" aria-label="Travel">
      <header class="travel-header">
        <div>
          <p class="eyebrow">Org travel</p>
          <h2>Travel</h2>
          <p>${escapeHtml(travelSummary(travel))}</p>
        </div>
        <dl class="travel-metrics">
          <div><dt>Places</dt><dd>${travel.places.length}</dd></div>
          <div><dt>Sources</dt><dd>${travel.sourceCount}</dd></div>
          <div><dt>Located</dt><dd>${travel.locatedCount}</dd></div>
          <div><dt>Enrich</dt><dd>${travel.enrichCandidateCount}</dd></div>
        </dl>
      </header>
      <div class="travel-layout">
        <div class="travel-card-grid"${travel.places.length >= virtualListThreshold ? " data-travel-virtual-list" : ""}>
          ${travel.places.map(renderTravelPlaceCard).join("")}
        </div>
      </div>
    </section>
  `;
};

const renderTravelPlaceCard = (place: TravelPlace): string => {
  const mapId = `travel-map-${place.id}`;
  return `
  <article class="travel-place-card travel-place-card--${escapeAttribute(place.kind)}" data-travel-card data-travel-title="${escapeAttribute(place.title)}" role="button" tabindex="0" aria-label="${escapeAttribute(`Preview ${place.title}`)}">
    <div class="travel-card-head">
      <div class="travel-card-kicker">
        <span>${escapeHtml(kindLabel(place.kind))}</span>
        ${place.region ? `<b>${escapeHtml(place.region)}</b>` : ""}
      </div>
      <h3>${escapeHtml(place.title)}</h3>
      <p>${escapeHtml(place.outline)}</p>
    </div>
    ${renderTravelTags(place)}
    <dl class="travel-place-facts travel-place-facts--compact">
      <div><dt>Query</dt><dd>${escapeHtml(place.query)}</dd></div>
      ${
        place.coordinates
          ? `<div><dt>Coordinates</dt><dd>${escapeHtml(`${place.coordinates.lat}, ${place.coordinates.lon}`)}</dd></div>`
          : ""
      }
    </dl>
    <div class="travel-card-status">
      <span>${place.coordinates ? "Located" : "Needs geo"}</span>
      <span>${place.sourceLinks.length} sources</span>
      <span>${place.enrichFields.length} enrich</span>
    </div>
    <div class="travel-card-actions">
      <button type="button" class="travel-map-toggle" data-travel-map-toggle aria-expanded="false" aria-controls="${mapId}">Map preview</button>
    </div>
    ${renderEmbeddedMap(place, mapId)}
    ${renderTravelGlanceTemplate(place)}
  </article>
`;
};

const renderEmbeddedMap = (
  place: TravelPlace,
  id: string,
  modifierClass = "",
  hidden = true,
): string => `
  <div id="${escapeAttribute(id)}" class="travel-inline-map ${escapeAttribute(modifierClass)}" data-travel-map${hidden ? " hidden" : ""}>
    <iframe
      title="${escapeAttribute(`Google Maps preview for ${place.title}`)}"
      data-map-src="${escapeAttribute(place.googleMapsEmbedUrl)}"
      loading="lazy"
      referrerpolicy="no-referrer-when-downgrade"
      allowfullscreen
    ></iframe>
  </div>
`;

const renderTravelGlanceTemplate = (place: TravelPlace): string => `
  <template data-travel-glance-template>
    <section class="travel-glance-card">
      <header>
        <span>${escapeHtml(kindLabel(place.kind))}</span>
        <h3>${escapeHtml(place.title)}</h3>
        <p>${escapeHtml(place.outline)}</p>
      </header>
      <div class="travel-glance-detail">
        <div class="travel-glance-info">
          <dl class="travel-glance-facts">
            <div><dt>Map query</dt><dd>${escapeHtml(place.query)}</dd></div>
            ${place.sourceName || place.sourceFile ? `<div><dt>Source</dt><dd>${escapeHtml(place.sourceName ?? place.sourceFile ?? "")}</dd></div>` : ""}
            ${place.region ? `<div><dt>Region</dt><dd>${escapeHtml(place.region)}</dd></div>` : ""}
            ${
              place.coordinates
                ? `<div><dt>Coordinates</dt><dd>${escapeHtml(`${place.coordinates.lat}, ${place.coordinates.lon}`)}</dd></div>`
                : ""
            }
          </dl>
          ${renderEvidence(place.evidence)}
          ${renderSourceLinks(place)}
          ${renderEnrichFields(place)}
        </div>
        ${renderEmbeddedMap(place, `travel-glance-map-${place.id}`, "travel-inline-map--glance", false)}
      </div>
    </section>
  </template>
`;

const renderTravelTags = (place: TravelPlace): string =>
  place.tags.length > 0
    ? `<div class="travel-tags">${place.tags
        .slice(0, 8)
        .map((tag) => `<span>${escapeHtml(tag)}</span>`)
        .join("")}</div>`
    : "";

const renderEvidence = (items: TravelEvidence[]): string =>
  items.length > 0
    ? `<dl class="travel-evidence">${items
        .map(
          (item) => `
            <div>
              <dt>${escapeHtml(item.label)}</dt>
              <dd>${escapeHtml(item.value)}</dd>
            </div>
          `,
        )
        .join("")}</dl>`
    : "";

const renderSourceLinks = (place: TravelPlace): string =>
  place.sourceLinks.length > 0
    ? `<div class="travel-source-links">${place.sourceLinks
        .slice(0, 4)
        .map(
          (link) =>
            `<a href="${escapeAttribute(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(linkLabel(link.kind))}: ${escapeHtml(link.label)}</a>`,
        )
        .join("")}</div>`
    : "";

const renderEnrichFields = (place: TravelPlace): string =>
  place.enrichFields.length > 0
    ? `<div class="travel-enrich">
        <span>Enrich contract</span>
        ${place.enrichFields.map((field) => `<code>${escapeHtml(field)}</code>`).join("")}
      </div>`
    : "";

const travelSummary = (travel: TravelView): string =>
  travel.siteWide
    ? `${travel.places.length} Org headings projected from ${travel.sourceCount} source files across ${travel.regions.length} regions.`
    : `${travel.places.length} Org headings projected into travel places across ${travel.regions.length} regions.`;

const kindLabel = (kind: TravelPlace["kind"]): string => {
  switch (kind) {
    case "region":
      return "Region";
    case "place":
      return "Place";
  }
};

const linkLabel = (kind: TravelPlace["sourceLinks"][number]["kind"]): string => {
  switch (kind) {
    case "video":
      return "Video";
    case "wiki":
      return "Wiki";
    case "web":
      return "Link";
  }
};

const escapeHtml = (value: string | number): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const escapeAttribute = escapeHtml;
