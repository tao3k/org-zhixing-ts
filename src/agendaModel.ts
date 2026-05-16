import type {
  OrgizeAgendaViewCardDto,
  OrgizeAgendaViewResponseDto,
  OrgizeViewIndexRecordDto,
} from "orgize/dto";
import type { AgendaModeKey } from "./config";
import type {
  AgendaCardView,
  SuperAgendaAiBrief,
  SuperAgendaCaptureEntry,
  SuperAgendaGroup,
  SuperAgendaMetric,
  SuperAgendaSelectorRule,
  SuperAgendaSortStep,
  SuperAgendaTone,
  SuperAgendaWorkspace,
} from "./agendaTypes";
import type { OrgizeDocumentView } from "./model";

type AgendaGroupSpec = Omit<SuperAgendaGroup, "cards"> & {
  match: (card: AgendaCardView) => boolean;
};

type AgendaModeDefinition = {
  label: string;
  description: string;
};

export const agendaModeDefinitions: Record<AgendaModeKey, AgendaModeDefinition> = {
  focus: {
    label: "Focus",
    description: "Prioritize the next concrete execution surfaces.",
  },
  pressure: {
    label: "Pressure",
    description: "Surface deadline, blocker, and waiting risk first.",
  },
  flow: {
    label: "Flow",
    description: "Read the week as a dated operational stream.",
  },
};

export const superAgendaWorkspace = (
  document: OrgizeDocumentView | null,
  mode: AgendaModeKey,
): SuperAgendaWorkspace | null => {
  if (!document?.agendaView || !document.agendaRange) {
    return null;
  }

  const cards = document.agendaView.cards.map((card) =>
    agendaCardView(card, document.recordsByRangeStart),
  );
  const groups = groupAgendaCards(cards, mode).filter((group) => group.cards.length > 0);
  const blockedCount = cards.filter((card) => card.blockers.length > 0).length;
  const timedCount = cards.filter((card) => Boolean(card.time)).length;
  const deadlineCount = cards.filter((card) => card.kind === "deadline").length;
  const receiptCount = cards.reduce((sum, card) => sum + card.receipts.length, 0);
  const memoryCount = cards.filter((card) => card.memorySignals.length > 0).length;
  const propertyCount = cards.reduce((sum, card) => sum + (card.record?.properties.length ?? 0), 0);
  const modeDefinition = agendaModeDefinitions[mode];

  return {
    mode,
    modeLabel: modeDefinition.label,
    modeDescription: modeDefinition.description,
    rangeLabel: document.agendaRange.label,
    totalCandidates: document.agendaView.totalCandidates,
    visibleCount: cards.length,
    skippedCount: document.agendaView.skipped.length,
    limit: document.agendaView.limit ?? null,
    insights: agendaInsights(
      cards,
      deadlineCount,
      timedCount,
      blockedCount,
      receiptCount,
      document,
    ),
    metrics: agendaMetrics(
      cards,
      blockedCount,
      deadlineCount,
      receiptCount,
      propertyCount,
      memoryCount,
      document,
    ),
    selectorRules: groups.map(selectorRule),
    aiBrief: agendaAiBrief(cards, {
      blockedCount,
      deadlineCount,
      timedCount,
      receiptCount,
      memoryCount,
    }),
    sortSteps: effectiveSortSteps(document.agendaView),
    groups,
    skipped: document.agendaView.skipped,
  };
};

const agendaInsights = (
  cards: AgendaCardView[],
  deadlineCount: number,
  timedCount: number,
  blockedCount: number,
  receiptCount: number,
  document: OrgizeDocumentView,
): string[] => [
  `${cards.length} visible`,
  `${deadlineCount} deadlines`,
  `${timedCount} timed`,
  `${blockedCount} blocked`,
  `${receiptCount} receipts`,
  document.agendaView?.skipped.length
    ? `${document.agendaView.skipped.length} skipped by limit`
    : "no hidden candidates",
];

const agendaMetrics = (
  cards: AgendaCardView[],
  blockedCount: number,
  deadlineCount: number,
  receiptCount: number,
  propertyCount: number,
  memoryCount: number,
  document: OrgizeDocumentView,
): SuperAgendaMetric[] => [
  {
    label: "Agenda rows",
    value: String(cards.length),
    detail: `${document.agendaView?.totalCandidates ?? cards.length} parsed candidates`,
    tone: "steady",
  },
  {
    label: "Risk edges",
    value: String(blockedCount + deadlineCount),
    detail: `${blockedCount} blocked / ${deadlineCount} deadline`,
    tone: blockedCount > 0 ? "critical" : deadlineCount > 0 ? "deadline" : "steady",
  },
  {
    label: "AI context",
    value: String(receiptCount + propertyCount),
    detail: `${receiptCount} receipts / ${propertyCount} properties`,
    tone: "focus",
  },
  {
    label: "Memory rows",
    value: String(memoryCount),
    detail: "record, blog, attach, or ID signals",
    tone: memoryCount > 0 ? "waiting" : "muted",
  },
];

const selectorRule = (group: SuperAgendaGroup): SuperAgendaSelectorRule => ({
  id: group.id,
  label: group.title,
  selector: group.selector,
  description: group.subtitle,
  count: group.cards.length,
  tone: group.tone,
});

const agendaCardView = (
  card: OrgizeAgendaViewCardDto,
  recordsByRangeStart: ReadonlyMap<number, OrgizeViewIndexRecordDto>,
): AgendaCardView => {
  const record = recordsByRangeStart.get(card.source.rangeStart) ?? null;
  return {
    ...card,
    record,
    signals: agendaSignals(card, record),
    pressure: agendaPressure(card),
    aiState: agendaAiState(card, record),
    memorySignals: agendaMemorySignals(card, record),
  };
};

const groupAgendaCards = (cards: AgendaCardView[], mode: AgendaModeKey): SuperAgendaGroup[] => {
  if (mode === "flow") {
    return groupAgendaCardsByDate(cards);
  }
  const remaining = new Set(cards);
  return agendaGroupSpecsFor(mode).map((spec) => {
    const grouped: AgendaCardView[] = [];
    for (const card of cards) {
      if (remaining.has(card) && spec.match(card)) {
        grouped.push(card);
        remaining.delete(card);
      }
    }
    return { ...spec, cards: grouped };
  });
};

const agendaGroupSpecsFor = (mode: Exclude<AgendaModeKey, "flow">): AgendaGroupSpec[] => {
  const specs = {
    focus: [
      blockedGroupSpec(),
      timedGroupSpec(),
      deadlineGroupSpec(),
      waitingGroupSpec(),
      doneGroupSpec(),
      scheduledGroupSpec(),
      otherGroupSpec(),
    ],
    pressure: [
      deadlineGroupSpec(),
      blockedGroupSpec(),
      waitingGroupSpec(),
      timedGroupSpec(),
      scheduledGroupSpec(),
      doneGroupSpec(),
      otherGroupSpec(),
    ],
  } satisfies Record<Exclude<AgendaModeKey, "flow">, AgendaGroupSpec[]>;
  return specs[mode];
};

const groupAgendaCardsByDate = (cards: AgendaCardView[]): SuperAgendaGroup[] => {
  const groups = new Map<string, AgendaCardView[]>();
  for (const card of cards) {
    groups.set(card.displayDate, [...(groups.get(card.displayDate) ?? []), card]);
  }
  return [...groups.entries()].map(([date, groupCards]) => ({
    id: `date-${date}`,
    title: date,
    subtitle: flowSubtitle(groupCards),
    selector: ":auto-planning",
    tone: dominantTone(groupCards),
    cards: groupCards,
  }));
};

const flowSubtitle = (cards: AgendaCardView[]): string => {
  const timed = cards.filter((card) => card.time).length;
  const deadlines = cards.filter((card) => card.kind === "deadline").length;
  const blockers = cards.filter((card) => card.blockers.length > 0).length;
  return [
    `${cards.length} rows`,
    timed > 0 ? `${timed} timed` : null,
    deadlines > 0 ? `${deadlines} deadline` : null,
    blockers > 0 ? `${blockers} blocked` : null,
  ]
    .filter(Boolean)
    .join(" / ");
};

const dominantTone = (cards: AgendaCardView[]): SuperAgendaTone => {
  const tones: SuperAgendaTone[] = ["critical", "deadline", "focus", "waiting", "done"];
  return tones.find((tone) => cards.some((card) => card.pressure === tone)) ?? "steady";
};

const blockedGroupSpec = (): AgendaGroupSpec => ({
  id: "blocked",
  title: "Blocked Flow",
  subtitle: "Parser-owned ORDERED edges or dependency receipts need attention.",
  selector: ":and (:children todo :property ORDERED)",
  tone: "critical",
  match: (card) => card.blockers.length > 0,
});

const timedGroupSpec = (): AgendaGroupSpec => ({
  id: "focus",
  title: "Timed Focus",
  subtitle: "Items with concrete time windows that shape the day.",
  selector: ":time-grid",
  tone: "focus",
  match: (card) => Boolean(card.time),
});

const deadlineGroupSpec = (): AgendaGroupSpec => ({
  id: "deadline",
  title: "Deadline Pressure",
  subtitle: "Deadline rows and due-date warnings from the agenda projection.",
  selector: ":deadline",
  tone: "deadline",
  match: (card) => card.kind === "deadline",
});

const waitingGroupSpec = (): AgendaGroupSpec => ({
  id: "waiting",
  title: "Waiting State",
  subtitle: "Work that is visible, but intentionally parked.",
  selector: ":todo WAIT",
  tone: "waiting",
  match: (card) => card.todo === "WAIT" || card.todo === "WAITING",
});

const doneGroupSpec = (): AgendaGroupSpec => ({
  id: "done",
  title: "Completed Signal",
  subtitle: "Closed or done rows kept visible for recent operational context.",
  selector: ":log closed",
  tone: "done",
  match: (card) => card.kind === "closed" || card.todoState === "done",
});

const scheduledGroupSpec = (): AgendaGroupSpec => ({
  id: "scheduled",
  title: "Scheduled Flow",
  subtitle: "Planned work without a tighter attention signal.",
  selector: ":scheduled",
  tone: "steady",
  match: (card) => card.kind === "scheduled",
});

const otherGroupSpec = (): AgendaGroupSpec => ({
  id: "other",
  title: "Other Candidates",
  subtitle: "Remaining parser-visible rows, preserved instead of dropped.",
  selector: ":anything",
  tone: "muted",
  match: () => true,
});

const agendaSignals = (
  card: OrgizeAgendaViewCardDto,
  record: OrgizeViewIndexRecordDto | null,
): string[] => {
  const signals = [
    card.todo,
    card.category,
    card.time ? `${card.time}${card.endTime ? `-${card.endTime}` : ""}` : null,
    ...card.effectiveTags.map((tag) => `#${tag}`),
    ...(record?.properties ?? [])
      .filter((property) => ["AREA", "EFFORT", "KIND", "ID"].includes(property.key))
      .map((property) => `${property.key}: ${property.value}`),
  ];
  return signals.filter((signal): signal is string => Boolean(signal));
};

const agendaMemorySignals = (
  card: OrgizeAgendaViewCardDto,
  record: OrgizeViewIndexRecordDto | null,
): string[] => {
  const tags = card.effectiveTags.map((tag) => tag.toLowerCase());
  const signals = [
    tags.includes("record") ? "record" : null,
    tags.includes("blog") ? "blog" : null,
    tags.includes("attach") ? "attachment" : null,
    tags.includes("memory") ? "memory" : null,
    record?.properties.some((property) => property.key === "ID") ? "stable ID" : null,
    record?.properties.some((property) => property.key === "KIND") ? "typed record" : null,
    record?.properties.some((property) => property.key === "AREA") ? "area context" : null,
  ];
  return signals.filter((signal): signal is string => Boolean(signal));
};

const agendaPressure = (card: OrgizeAgendaViewCardDto): SuperAgendaTone => {
  if (card.blockers.length > 0) return "critical";
  if (card.kind === "deadline") return "deadline";
  if (card.time) return "focus";
  if (card.kind === "closed" || card.todoState === "done") return "done";
  return "steady";
};

const agendaAiState = (
  card: OrgizeAgendaViewCardDto,
  record: OrgizeViewIndexRecordDto | null,
): string => {
  if (card.blockers.length > 0) return "needs unblock brief";
  if (card.kind === "deadline") return "risk summary ready";
  if (card.time) return "execution slot ready";
  if (agendaMemorySignals(card, record).length > 0) return "memory context ready";
  return "agenda context ready";
};

const agendaAiBrief = (
  cards: AgendaCardView[],
  stats: {
    blockedCount: number;
    deadlineCount: number;
    timedCount: number;
    receiptCount: number;
    memoryCount: number;
  },
): SuperAgendaAiBrief => {
  const firstBlocked = cards.find((card) => card.blockers.length > 0);
  const firstDeadline = cards.find((card) => card.kind === "deadline");
  const firstTimed = cards.find((card) => Boolean(card.time));
  const firstMemory = cards.find((card) => card.memorySignals.length > 0);
  const recommendations = [
    firstBlocked ? `Ask the agent to explain the blocker chain for "${firstBlocked.title}".` : null,
    firstDeadline ? `Generate a deadline-risk note for "${firstDeadline.title}".` : null,
    firstTimed ? `Turn "${firstTimed.title}" into the next execution brief.` : null,
    firstMemory ? `Promote "${firstMemory.title}" into the running agenda record.` : null,
  ].filter((item): item is string => Boolean(item));
  return {
    headline: agendaHeadline(firstBlocked, firstDeadline, firstTimed),
    summary: [
      `${cards.length} visible agenda rows`,
      `${stats.receiptCount} parser receipts`,
      `${stats.memoryCount} memory-linked rows`,
      `${stats.blockedCount} blockers`,
      `${stats.deadlineCount} deadlines`,
      `${stats.timedCount} timed slots`,
    ].join(" / "),
    recommendations:
      recommendations.length > 0
        ? recommendations
        : ["Ask the agent to summarize the visible agenda into a daily operating note."],
    prompts: [
      "Explain today's agenda using receipts and blockers.",
      "Draft a progress log from DONE, record, and memory rows.",
      "Turn deadline pressure into a concrete next-action queue.",
    ],
    captureLog: agendaCaptureLog(cards),
  };
};

const agendaHeadline = (
  firstBlocked: AgendaCardView | undefined,
  firstDeadline: AgendaCardView | undefined,
  firstTimed: AgendaCardView | undefined,
): string =>
  firstBlocked
    ? `Unblock ${firstBlocked.title}`
    : firstDeadline
      ? `Watch ${firstDeadline.title}`
      : firstTimed
        ? `Start with ${firstTimed.title}`
        : "Agenda context is ready";

const agendaCaptureLog = (cards: AgendaCardView[]): SuperAgendaCaptureEntry[] =>
  cards
    .filter(
      (card) =>
        card.memorySignals.length > 0 || card.receipts.length > 0 || card.blockers.length > 0,
    )
    .slice(0, 6)
    .map((card) => ({
      title: card.title,
      label: card.memorySignals.length > 0 ? card.memorySignals.join(" / ") : card.aiState,
      detail: card.receipts[0]?.message ?? `${card.kind} on ${card.displayDate}`,
      tone: card.pressure,
    }));

const sortStepView = (
  step: OrgizeAgendaViewResponseDto["sortStrategy"][number],
): SuperAgendaSortStep => ({
  label: sortStepLabel(step.key),
  direction: step.direction,
  detail: sortStepDetail(step.key),
});

const effectiveSortSteps = (agendaView: OrgizeAgendaViewResponseDto): SuperAgendaSortStep[] => {
  if (agendaView.sortStrategy.length > 0) {
    return agendaView.sortStrategy.map(sortStepView);
  }
  return (agendaView.cards[0]?.sortKeys ?? []).map((step) => ({
    label: sortStepLabel(step.key),
    direction: "default",
    detail: sortStepDetail(step.key),
  }));
};

const sortStepLabel = (key: string): string => {
  const labels: Record<string, string> = {
    displayDate: "Planning date",
    time: "Time grid",
    kind: "Agenda kind",
    level: "Outline depth",
    title: "Title",
    targetDate: "Target date",
    scheduledDate: "Scheduled date",
    deadlineDate: "Deadline date",
    priority: "Priority",
    category: "Category",
    todoState: "TODO state",
  };
  return labels[key] ?? key;
};

const sortStepDetail = (key: string): string => {
  const details: Record<string, string> = {
    displayDate: "daily and weekly agenda order",
    time: "keeps timed rows close to execution",
    kind: "separates scheduled, deadline, and closed rows",
    level: "preserves outline hierarchy pressure",
    title: "stable alphabetical fallback",
    targetDate: "normalizes timestamp targets",
    scheduledDate: "scheduled timestamp evidence",
    deadlineDate: "deadline timestamp evidence",
    priority: "Org priority signal",
    category: "source category signal",
    todoState: "stateful completion signal",
  };
  return details[key] ?? "parser sort signal";
};
