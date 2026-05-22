import type { AgendaPanelKey } from "./agendaTypes";
import { resolveInitialAgendaPanel, resolveInitialAgendaRuleId } from "./agendaState";
import {
  loadSiteConfig,
  resolveInitialAgendaMode,
  resolveInitialSource,
  resolveInitialView,
  showPerformanceFromUrl,
  type AgendaModeKey,
  type SiteConfig,
  type SourceItem,
} from "./config";
import { loadStaticSiteData, withStaticSiteSources, type StaticSiteData } from "./staticSiteData";
import type { ViewKey } from "./model";

export type AppBootState = {
  agendaMode: AgendaModeKey;
  agendaPanel: AgendaPanelKey;
  agendaRuleId: string | null;
  currentView: ViewKey;
  initialSource: SourceItem;
  showPerformance: boolean;
  siteConfig: SiteConfig;
  staticSite: StaticSiteData | null;
};

export const loadAppBootState = async (): Promise<AppBootState> => {
  const staticSite = await loadStaticSiteData();
  const siteConfig = withStaticSiteSources(await loadSiteConfig(), staticSite);
  return {
    agendaMode: resolveInitialAgendaMode(siteConfig),
    agendaPanel: resolveInitialAgendaPanel(),
    agendaRuleId: resolveInitialAgendaRuleId(),
    currentView: resolveInitialView(siteConfig),
    initialSource: resolveInitialSource(siteConfig),
    showPerformance: showPerformanceFromUrl(siteConfig.behavior.showPerformance),
    siteConfig,
    staticSite,
  };
};
