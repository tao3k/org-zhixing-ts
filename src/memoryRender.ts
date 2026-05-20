import type {
  OrgizeAgentMemoryCardDto,
  OrgizeMemoryAuthorityReasonDto,
  OrgizeMemoryEvidenceDto,
  OrgizeMemoryLinkDto,
  OrgizeMemoryPropertyDto,
  OrgizeMemoryRecordDto,
  OrgizeMemoryStatsDto,
} from "orgize/dto";
import type { AgentMemoryView, MemoryFacetView, MemoryStateGroup } from "./memoryModel";
import { memoryAnchorId, memorySourceLabel, memoryStateLabel } from "./memoryModel";
import { renderMemoryRecordArticle, type OrgRecordRenderContext } from "./recordRender";

export const renderAgentMemory = (
  memory: AgentMemoryView | null,
  context: OrgRecordRenderContext,
): string => {
  if (!memory) {
    return `<div class="empty">Loading memory projection...</div>`;
  }
  if (memory.response.stats.totalRecords === 0) {
    return `
      <section class="memory-workbench">
        <header class="memory-header">
          <div>
            <p class="eyebrow">Org memory</p>
            <h2>No memory records in this source</h2>
            <p>Headings, properties, planning timestamps, links, drawers, and lifecycle evidence will appear here when present.</p>
          </div>
        </header>
      </section>
    `;
  }
  return `
    <section class="memory-workbench" aria-label="Org memory">
      <header class="memory-header">
        <div>
          <p class="eyebrow">Org memory</p>
          <h2>Agent memory graph</h2>
          <p>Orgize projection of records, cards, source evidence, authority rules, links, and historical state.</p>
        </div>
        ${renderMemoryMetrics(memory.response.stats)}
      </header>
      <div class="memory-layout">
        <main class="memory-stream" aria-label="Memory cards and records">
          ${memory.groups.map(renderMemoryGroup).join("")}
          ${renderRecordIndex(memory.groups, context)}
        </main>
        <aside class="memory-inspector" aria-label="Memory facets">
          ${renderStateMatrix(memory.response.stats)}
          ${renderFacetPanel("Evidence", memory.topEvidence)}
          ${renderFacetPanel("Authority", memory.topAuthority)}
        </aside>
      </div>
    </section>
  `;
};

const renderMemoryMetrics = (stats: OrgizeMemoryStatsDto): string => `
  <dl class="memory-metrics" aria-label="Memory metrics">
    ${renderMetric("records", stats.totalRecords)}
    ${renderMetric("current", stats.currentRecords)}
    ${renderMetric("background", stats.backgroundRecords)}
    ${renderMetric("history", stats.closedRecords + stats.archivedRecords)}
    ${renderMetric("evidence", stats.evidence)}
    ${renderMetric("authority", stats.authorityReasons)}
  </dl>
`;

const renderMetric = (label: string, value: number): string => `
  <div>
    <dt>${escapeHtml(label)}</dt>
    <dd>${value}</dd>
  </div>
`;

const renderMemoryGroup = (group: MemoryStateGroup): string => {
  if (group.cards.length === 0) {
    return "";
  }
  return `
    <section class="memory-lane memory-lane--${group.state}" aria-label="${escapeAttribute(group.label)} memory">
      <header class="memory-lane-header">
        <div>
          <span>${escapeHtml(group.label)}</span>
          <h3>${group.cards.length} cards</h3>
        </div>
        <p>${escapeHtml(group.summary)}</p>
      </header>
      <div class="memory-card-list">
        ${group.cards.map(renderMemoryCard).join("")}
      </div>
    </section>
  `;
};

const renderMemoryCard = (card: OrgizeAgentMemoryCardDto): string => `
  <article class="memory-card memory-card--${card.decision.severity}">
    <header class="memory-card-topline">
      <span class="memory-code">${escapeHtml(card.decision.code)}</span>
      <span class="memory-severity">${escapeHtml(card.decision.severity)}</span>
      <a class="memory-source-link" href="#${memoryAnchorId(card.source)}">${escapeHtml(memorySourceLabel(card.source))}</a>
    </header>
    <div class="memory-card-body">
      <h4>${escapeHtml(card.title)}</h4>
      <p>${escapeHtml(card.decision.title)}</p>
      ${renderTags([card.todo, ...card.effectiveTags])}
    </div>
    <div class="memory-card-grid">
      ${renderEvidenceList(card.evidence)}
      ${renderAuthorityList(card.authority)}
      ${renderLinkList(card.links)}
    </div>
    <div class="memory-next"><span>next</span><p>${escapeHtml(card.decision.nextAction)}</p></div>
  </article>
`;

const renderRecordIndex = (groups: MemoryStateGroup[], context: OrgRecordRenderContext): string => `
  <section class="memory-record-index" aria-label="Memory record index">
    <header class="memory-section-heading">
      <p class="eyebrow">Record index</p>
      <h3>Source-backed memory records</h3>
    </header>
    ${groups.map((group) => renderRecordGroup(group, context)).join("")}
  </section>
`;

const renderRecordGroup = (group: MemoryStateGroup, context: OrgRecordRenderContext): string => {
  if (group.records.length === 0) {
    return "";
  }
  return `
    <details class="memory-record-group" ${group.state === "current" ? "open" : ""}>
      <summary>
        <span>${escapeHtml(group.label)}</span>
        <strong>${group.records.length}</strong>
      </summary>
      <div class="memory-record-list">
        ${group.records.map((record) => renderMemoryRecord(record, context)).join("")}
      </div>
    </details>
  `;
};

const renderMemoryRecord = (
  record: OrgizeMemoryRecordDto,
  context: OrgRecordRenderContext,
): string => {
  const renderedRecord = renderMemoryRecordArticle(record, context);
  return `
    <article class="memory-record" id="${memoryAnchorId(record.source)}">
      <header>
        <div>
          <span>${escapeHtml(memoryStateLabel(record.state))}</span>
          <h4>${escapeHtml(record.title)}</h4>
        </div>
        <code>${escapeHtml(memorySourceLabel(record.source))}</code>
      </header>
      ${renderTags([record.todo, ...record.effectiveTags])}
      ${renderedRecord ?? ""}
      <div class="memory-record-details">
        ${renderProperties(record.properties)}
        ${renderEvidenceDetails(record.evidence)}
        ${renderLinkDetails(record.links)}
      </div>
    </article>
  `;
};

const renderStateMatrix = (stats: OrgizeMemoryStatsDto): string => `
  <section class="memory-inspector-section">
    <p class="eyebrow">State matrix</p>
    <dl class="memory-state-matrix">
      ${renderStateMetric("Current", stats.currentRecords, stats.totalRecords)}
      ${renderStateMetric("Background", stats.backgroundRecords, stats.totalRecords)}
      ${renderStateMetric("Closed", stats.closedRecords, stats.totalRecords)}
      ${renderStateMetric("Archived", stats.archivedRecords, stats.totalRecords)}
    </dl>
  </section>
`;

const renderStateMetric = (label: string, count: number, total: number): string => {
  const width = total > 0 ? Math.max(4, Math.round((count / total) * 100)) : 0;
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd><span style="--memory-bar:${width}%"></span><strong>${count}</strong></dd>
    </div>
  `;
};

const renderFacetPanel = (label: string, facets: MemoryFacetView[]): string => `
  <section class="memory-inspector-section">
    <p class="eyebrow">${escapeHtml(label)}</p>
    ${
      facets.length > 0
        ? `<ul class="memory-facets">${facets.map(renderFacet).join("")}</ul>`
        : `<p>No ${label.toLowerCase()} facets.</p>`
    }
  </section>
`;

const renderFacet = (facet: MemoryFacetView): string => `
  <li>
    <span style="--memory-bar:${Math.max(4, Math.round(facet.weight * 100))}%"></span>
    <strong>${escapeHtml(facet.label)}</strong>
    <em>${facet.count}</em>
  </li>
`;

const renderEvidenceList = (items: OrgizeMemoryEvidenceDto[]): string => `
  <section>
    <h5>Evidence</h5>
    ${
      items.length > 0
        ? `<div class="memory-chip-list">${items.slice(0, 8).map(renderEvidenceChip).join("")}</div>`
        : `<p>None</p>`
    }
  </section>
`;

const renderAuthorityList = (items: OrgizeMemoryAuthorityReasonDto[]): string => `
  <section>
    <h5>Authority</h5>
    ${
      items.length > 0
        ? `<ul>${items.map((item) => `<li>${escapeHtml(item.label)}</li>`).join("")}</ul>`
        : `<p>None</p>`
    }
  </section>
`;

const renderLinkList = (items: OrgizeMemoryLinkDto[]): string => `
  <section>
    <h5>Links</h5>
    ${
      items.length > 0
        ? `<ul>${items.slice(0, 4).map(renderLinkItem).join("")}</ul>`
        : `<p>None</p>`
    }
  </section>
`;

const renderProperties = (properties: OrgizeMemoryPropertyDto[]): string => `
  <details ${properties.length > 0 ? "open" : ""}>
    <summary>Properties <span>${properties.length}</span></summary>
    ${
      properties.length > 0
        ? `<dl>${properties.map((property) => `<div><dt>${escapeHtml(property.key)}</dt><dd>${escapeHtml(property.value)}</dd></div>`).join("")}</dl>`
        : `<p>None</p>`
    }
  </details>
`;

const renderEvidenceDetails = (items: OrgizeMemoryEvidenceDto[]): string => `
  <details open>
    <summary>Evidence <span>${items.length}</span></summary>
    ${
      items.length > 0
        ? `<ul>${items.map((item) => `<li><strong>${escapeHtml(item.kind.label)}</strong><span>${escapeHtml(item.value)}</span></li>`).join("")}</ul>`
        : `<p>None</p>`
    }
  </details>
`;

const renderLinkDetails = (links: OrgizeMemoryLinkDto[]): string => `
  <details ${links.length > 0 ? "open" : ""}>
    <summary>Links <span>${links.length}</span></summary>
    ${links.length > 0 ? `<ul>${links.map(renderLinkItem).join("")}</ul>` : `<p>None</p>`}
  </details>
`;

const renderEvidenceChip = (item: OrgizeMemoryEvidenceDto): string =>
  `<span title="${escapeAttribute(item.value)}">${escapeHtml(item.kind.label)}</span>`;

const renderLinkItem = (link: OrgizeMemoryLinkDto): string =>
  `<li><code>${escapeHtml(link.path)}</code><span>${escapeHtml(link.description)}</span></li>`;

const renderTags = (tags: Array<string | null | undefined>): string => {
  const visibleTags = tags.filter((tag): tag is string => Boolean(tag));
  return visibleTags.length > 0
    ? `<div class="memory-tags">${visibleTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`
    : "";
};

const escapeHtml = (value: string | number): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const escapeAttribute = (value: string | number): string => escapeHtml(value);
