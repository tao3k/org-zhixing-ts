import type { AgendaPanelKey } from "./agendaTypes";
import type { BlogReaderState } from "./blogState";
import type { AgendaModeKey } from "./config";
import type { ViewKey } from "./model";

export type AppUrlState = {
  source?: string | null;
  view: ViewKey;
  agendaMode: AgendaModeKey;
  agendaPanel: AgendaPanelKey;
  agendaRuleId: string | null;
  blog: BlogReaderState;
};

export const writeAppUrlState = (state: AppUrlState): void => {
  const url = new URL(window.location.href);
  if (state.source === null) {
    url.searchParams.delete("source");
  } else if (state.source) {
    url.searchParams.set("source", state.source);
  }
  url.searchParams.set("view", state.view);
  if (state.view === "agenda") {
    writeAgendaUrlState(url, state);
  } else if (state.view === "blog") {
    writeBlogUrlState(url, state.blog);
  } else {
    clearProjectionUrlState(url);
  }
  window.history.replaceState(null, "", url);
};

const writeAgendaUrlState = (url: URL, state: AppUrlState): void => {
  url.searchParams.set("agenda", state.agendaMode);
  url.searchParams.set("panel", state.agendaPanel);
  if (state.agendaRuleId) {
    url.searchParams.set("rule", state.agendaRuleId);
  } else {
    url.searchParams.delete("rule");
  }
  url.searchParams.delete("article");
  url.searchParams.delete("zen");
};

const writeBlogUrlState = (url: URL, state: BlogReaderState): void => {
  url.searchParams.delete("agenda");
  url.searchParams.delete("panel");
  url.searchParams.delete("rule");
  if (state.articleRangeStart === null) {
    url.searchParams.delete("article");
  } else {
    url.searchParams.set("article", String(state.articleRangeStart));
  }
  if (state.zenMode) {
    url.searchParams.set("zen", "1");
  } else {
    url.searchParams.delete("zen");
  }
};

const clearProjectionUrlState = (url: URL): void => {
  url.searchParams.delete("agenda");
  url.searchParams.delete("panel");
  url.searchParams.delete("rule");
  url.searchParams.delete("article");
  url.searchParams.delete("zen");
};
