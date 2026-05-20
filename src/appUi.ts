import { createTabButtons } from "./appChrome";
import type { AppDomNodes } from "./appDom";
import { renderSourceBlocks } from "./sourceBlocks";
import type { SiteConfig, SourceItem } from "./config";
import type { ViewKey } from "./model";

export const configureChrome = (
  dom: AppDomNodes,
  config: SiteConfig,
  currentView: ViewKey,
  sourceItem: SourceItem | null,
): void => {
  document.documentElement.lang = config.locale;
  document.title = config.title;
  dom.siteTitle.textContent = config.title;
  renderSourceOptionsToDom(dom, config, sourceItem);
  dom.tabs.replaceChildren(...createTabButtons(config, currentView));
};

export const renderSourceOptionsToDom = (
  dom: AppDomNodes,
  config: SiteConfig,
  sourceItem: SourceItem | null,
): void => {
  const { active, blocks, options } = renderSourceBlocks(config, sourceItem?.file, sourceItem);
  dom.sourceSelect.replaceChildren(...options);
  dom.sourceFeed.replaceChildren(...blocks);
  dom.activeSourceTitle.textContent = active?.name ?? config.title;
  dom.activeSourcePath.textContent = active ? `${active.file} / blog source` : "No Org source";
};

export const updateActiveTab = (dom: AppDomNodes, currentView: ViewKey): void => {
  for (const button of dom.tabs.querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.view === currentView);
  }
};

export const scrollAgendaRuleIntoView = (dom: AppDomNodes, ruleId: string): void => {
  requestAnimationFrame(() => {
    const target = dom.view.querySelector<HTMLElement>(
      `[data-agenda-group-rule="${CSS.escape(ruleId)}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
};
