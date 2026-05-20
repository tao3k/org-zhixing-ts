import type { OrgizeAgendaViewSkipDto } from "orgize/dto";
import type { AgendaModeKey } from "./config";
import type {
  AgendaCardView,
  AgendaPanelKey,
  SuperAgendaGroup,
  SuperAgendaTransformerKey,
  SuperAgendaWorkspace,
} from "./agendaTypes";
import { agendaPrograms, superAgendaWorkspace } from "./agendaModel";
import { renderAgendaInspector } from "./agendaPanels";
import { agendaItems, type AgendaItem, type OrgizeDocumentView } from "./model";

export const renderAgenda = (
  document: OrgizeDocumentView,
  agendaMode: AgendaModeKey,
  agendaPanel: AgendaPanelKey,
  selectedRuleId: string | null,
): string => {
  const workspace = superAgendaWorkspace(document, agendaMode);
  if (!workspace) {
    return renderAgendaFallback(agendaItems(document));
  }
  if (workspace.totalCandidates === 0) {
    const fallbackItems = agendaItems(document);
    if (fallbackItems.length > 0) {
      return renderAgendaFallback(
        fallbackItems,
        agendaWindowFallbackMessage(workspace.rangeLabel, fallbackItems.length),
      );
    }
    return `<div class="empty">No agenda rows in ${escapeHtml(workspace.rangeLabel)}.</div>`;
  }
  const activeRuleId = activeAgendaRuleId(workspace, selectedRuleId);
  return `
    <section class="super-agenda agenda-workbench">
      <header class="agenda-program-header">
        <div class="agenda-program-copy">
          <p class="eyebrow">Org Super Agenda workbench</p>
          <h2>${escapeHtml(workspace.program.label)}</h2>
          <p>${escapeHtml(workspace.program.intent)}</p>
          <div class="agenda-program-badges">
            <span>selector DSL</span>
            <span>consume pipeline</span>
            <span>auto groups</span>
            <span>agent handoff</span>
          </div>
        </div>
        <dl class="agenda-metrics agenda-metrics--program">
          ${workspace.metrics.map(renderAgendaMetric).join("")}
        </dl>
      </header>
      ${renderAgendaProgramControls(workspace.mode)}
      <div class="agenda-insights agenda-insights--dense">
        <strong>${escapeHtml(workspace.rangeLabel)}</strong>
        ${workspace.insights.map((insight) => `<span>${escapeHtml(insight)}</span>`).join("")}
      </div>
      <div class="agenda-program-layout">
        <aside class="agenda-inspector">
          ${renderAgendaInspector(workspace, agendaPanel, activeRuleId)}
        </aside>
        <main class="agenda-output" aria-label="Compiled agenda sections">
          <div class="agenda-section-heading agenda-section-heading--large">
            <span>Compiled sections</span>
            <strong>${workspace.groups.length} sections / ${workspace.consumedCount} consumed</strong>
          </div>
          ${renderRuleMicroscope(workspace, activeRuleId)}
          <div class="agenda-groups">
            ${workspace.groups.map((group) => renderSuperAgendaGroup(group, activeRuleId)).join("")}
          </div>
          ${renderSkippedAgenda(workspace)}
        </main>
      </div>
    </section>
  `;
};

const renderAgendaMetric = (metric: SuperAgendaWorkspace["metrics"][number]): string => `
  <div class="agenda-metric agenda-metric--${metric.tone}">
    <dt>${escapeHtml(metric.label)}</dt>
    <dd>${escapeHtml(metric.value)}</dd>
    <small>${escapeHtml(metric.detail)}</small>
  </div>
`;

const renderAgendaProgramControls = (activeMode: AgendaModeKey): string => `
  <div class="agenda-program-switcher" role="group" aria-label="Super agenda program">
    ${Object.values(agendaPrograms)
      .map(
        (program) => `
          <button
            type="button"
            data-agenda-mode="${escapeHtml(program.key)}"
            class="${program.key === activeMode ? "active" : ""}"
          >
            <strong>${escapeHtml(program.shortLabel)}</strong>
            <span>${escapeHtml(program.description)}</span>
          </button>
        `,
      )
      .join("")}
  </div>
`;

const activeAgendaRuleId = (
  workspace: SuperAgendaWorkspace,
  selectedRuleId: string | null,
): string | null => {
  if (selectedRuleId && workspace.trace.some((step) => step.ruleId === selectedRuleId)) {
    return selectedRuleId;
  }
  return (
    workspace.trace.find((step) => step.emittedCount > 0)?.ruleId ??
    workspace.trace[0]?.ruleId ??
    null
  );
};

const renderAgendaFallback = (
  items: AgendaItem[],
  message = "Projecting parser-owned agenda intelligence...",
): string => {
  if (items.length === 0) {
    return `<div class="empty">No scheduled, deadline, or closed planning data found.</div>`;
  }
  return `
    <section class="agenda-loading">
      <div class="empty">${escapeHtml(message)}</div>
      <ol class="agenda-list">${items.map(renderFallbackAgendaItem).join("")}</ol>
    </section>
  `;
};

const renderFallbackAgendaItem = (item: AgendaItem): string => `
  <li>
    <span class="agenda-kind ${item.kind}">${item.kind}</span>
    <strong>${escapeHtml(item.title)}</strong>
    <code>${escapeHtml(item.value)}</code>
    <small>${item.tags.map(escapeHtml).join(" ")}</small>
  </li>
`;

const agendaWindowFallbackMessage = (rangeLabel: string, itemCount: number): string =>
  `Agenda window ${rangeLabel} has no projected rows. Showing ${itemCount} source planning item${
    itemCount === 1 ? "" : "s"
  } from the current Org file instead.`;

const renderRuleMicroscope = (
  workspace: SuperAgendaWorkspace,
  activeRuleId: string | null,
): string => {
  const step = workspace.trace.find((traceStep) => traceStep.ruleId === activeRuleId);
  if (!step) {
    return "";
  }
  const affectedGroups = workspace.groups.filter((group) => group.ruleId === step.ruleId);
  const outputLabel =
    affectedGroups.length > 0
      ? affectedGroups.map((group) => group.title).join(" / ")
      : step.outputTitles.join(" / ") || "no visible section";
  return `
    <section class="agenda-rule-microscope agenda-rule-microscope--${step.tone}">
      <div>
        <span>Rule microscope</span>
        <strong>${escapeHtml(step.title)}</strong>
        <code>${escapeHtml(step.selector)}</code>
      </div>
      <dl>
        <div><dt>operation</dt><dd>${escapeHtml(step.operation)}</dd></div>
        <div><dt>matched</dt><dd>${step.matchedCount}</dd></div>
        <div><dt>emitted</dt><dd>${step.emittedCount}</dd></div>
        <div><dt>remain</dt><dd>${step.remainingAfter}</dd></div>
      </dl>
      <p>${escapeHtml(outputLabel)}</p>
    </section>
  `;
};

const renderSuperAgendaGroup = (group: SuperAgendaGroup, activeRuleId: string | null): string => `
  <details
    class="agenda-group agenda-group--${group.tone} ${group.ruleId === activeRuleId ? "agenda-group--selected" : ""}"
    data-agenda-group-rule="${escapeHtml(group.ruleId)}"
    open
  >
    <summary data-agenda-rule-select="${escapeHtml(group.ruleId)}">
      <span class="agenda-group-title">
        <span class="agenda-group-line">
          <code>${escapeHtml(group.selector)}</code>
          <em>order ${group.order}</em>
          ${group.face ? `<em>face ${escapeHtml(group.face)}</em>` : ""}
          ${group.transformer ? `<em>transform ${escapeHtml(group.transformer)}</em>` : ""}
        </span>
        <strong>${escapeHtml(group.title)}</strong>
        <small>${escapeHtml(group.subtitle)}</small>
      </span>
      <span class="agenda-group-count">
        <b>${group.cards.length}</b>
        <small>rows</small>
      </span>
    </summary>
    ${renderGroupAgentHandoff(group)}
    <div class="agenda-row-stack">
      ${group.cards.map((card) => renderAgendaCard(card, group.transformer)).join("")}
    </div>
  </details>
`;

const renderGroupAgentHandoff = (group: SuperAgendaGroup): string => `
  <details class="agenda-group-handoff">
    <summary>agent handoff</summary>
    <div>
      <p>${escapeHtml(groupAgentPrompt(group))}</p>
      <div class="agenda-signal-row agenda-signal-row--compact">
        ${group.cards
          .slice(0, 4)
          .map((card) => `<span>${escapeHtml(card.title)}</span>`)
          .join("")}
      </div>
    </div>
  </details>
`;

const groupAgentPrompt = (group: SuperAgendaGroup): string =>
  [
    `Use selector ${group.selector} as the agenda boundary.`,
    `Summarize ${group.cards.length} rows in "${group.title}".`,
    "Preserve parser receipts, blockers, source lines, and memory signals.",
    "Return next actions, waiting reasons, and record updates separately.",
  ].join(" ");

const renderAgendaCard = (
  card: AgendaCardView,
  transformer: SuperAgendaTransformerKey | undefined,
): string => `
  <article class="agenda-row agenda-row--${card.pressure}">
    <div class="agenda-row-time">
      <span class="agenda-kind ${escapeHtml(card.kind)}">${escapeHtml(card.kind)}</span>
      <strong>${escapeHtml(card.displayDate)}</strong>
      <small>${card.time ? `${escapeHtml(card.time)}${card.endTime ? `-${escapeHtml(card.endTime)}` : ""}` : `#${card.sortedPosition}`}</small>
    </div>
    <div class="agenda-row-main">
      <h3>${escapeHtml(transformedTitle(card, transformer))}</h3>
      <p>${escapeHtml(card.agentState)}</p>
      <div class="agenda-signal-row agenda-signal-row--compact">
        ${card.signals
          .slice(0, 9)
          .map((signal) => `<span>${escapeHtml(signal)}</span>`)
          .join("")}
      </div>
      ${renderBlockers(card)}
    </div>
    <details class="agenda-row-evidence">
      <summary>evidence</summary>
      <div class="agenda-evidence-grid">
        ${renderReceiptRail(card)}
        ${renderMemoryRail(card)}
      </div>
    </details>
  </article>
`;

const transformedTitle = (
  card: AgendaCardView,
  transformer: SuperAgendaTransformerKey | undefined,
): string => {
  switch (transformer) {
    case "agent-context-label":
      return `[CONTEXT] ${card.title}`;
    case "deadline-risk-label":
      return `[RISK] ${card.title}`;
    case "uppercase-title":
      return card.title.toUpperCase();
    case undefined:
      return card.title;
  }
};

const renderReceiptRail = (card: AgendaCardView): string => `
  <section class="agenda-receipt-rail">
    <div class="agenda-mini-heading">
      <strong>Receipts</strong>
      <span>${card.receipts.length}</span>
    </div>
    <ul>
      ${card.receipts
        .slice(0, 4)
        .map((receipt) => `<li>${escapeHtml(receipt.message)}</li>`)
        .join("")}
    </ul>
  </section>
`;

const renderMemoryRail = (card: AgendaCardView): string => `
  <section class="agenda-memory-rail">
    <div class="agenda-mini-heading">
      <strong>Context</strong>
      <span>${card.memorySignals.length}</span>
    </div>
    <p>Source line ${card.source.start.line}</p>
    <div class="agenda-signal-row agenda-signal-row--compact">
      ${[
        ...card.memorySignals,
        ...card.sortKeys.slice(0, 4).map((key) => `${key.key}: ${key.value}`),
      ]
        .map((signal) => `<span>${escapeHtml(signal)}</span>`)
        .join("")}
    </div>
  </section>
`;

const renderBlockers = (card: AgendaCardView): string => {
  if (card.blockers.length === 0) {
    return "";
  }
  return `<div class="agenda-blockers">${card.blockers
    .map(
      (blocker) =>
        `<span>${escapeHtml(blocker.message)}: ${escapeHtml(blocker.blocker.title)}</span>`,
    )
    .join("")}</div>`;
};

const renderSkippedAgenda = (workspace: SuperAgendaWorkspace): string => {
  if (workspace.skipped.length === 0) {
    return "";
  }
  return `
    <details class="agenda-skipped">
      <summary>${workspace.skippedCount} skipped candidates</summary>
      <ol>
        ${workspace.skipped.map(renderSkippedAgendaItem).join("")}
      </ol>
    </details>
  `;
};

const renderSkippedAgendaItem = (item: OrgizeAgendaViewSkipDto): string => `
  <li>
    <strong>${escapeHtml(item.title)}</strong>
    <span>${escapeHtml(item.reason)}</span>
    <small>sorted #${item.sortedPosition}</small>
  </li>
`;

const escapeHtml = (value: string | number): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
