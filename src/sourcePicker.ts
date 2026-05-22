import type * as SelectModule from "@zag-js/select";
import type * as VanillaModule from "@zag-js/vanilla";
import type { Props as SelectProps } from "@zag-js/select";
import type { SourceItem } from "./config";

export const sourcePickerChangeEvent = "source-picker-change";

export type SourcePickerChangeDetail = {
  sourceFile: string;
};

type SourcePickerItem = Pick<SourceItem, "file" | "id" | "name" | "sourceFile">;

type SourcePickerNodes = {
  control: HTMLElement;
  content: HTMLElement;
  indicator: HTMLElement;
  label: HTMLElement;
  list: HTMLElement;
  positioner: HTMLElement;
  root: HTMLElement;
  trigger: HTMLButtonElement;
  value: HTMLElement;
};

type SourcePickerRuntime = {
  normalizeProps: typeof VanillaModule.normalizeProps;
  select: typeof SelectModule;
  spreadProps: typeof VanillaModule.spreadProps;
  VanillaMachine: typeof VanillaModule.VanillaMachine;
};

type SourcePickerMachine = {
  readonly service: Parameters<SourcePickerRuntime["select"]["connect"]>[0];
  start: () => void;
  stop: () => void;
  subscribe: (listener: () => void) => () => void;
  updateProps: (props: () => Partial<SelectProps<SourcePickerItem>>) => void;
};
type SourcePickerApi = ReturnType<SourcePickerRuntime["select"]["connect"]>;

const bindings = new WeakMap<HTMLElement, SourcePickerBinding>();
let runtimePromise: Promise<SourcePickerRuntime> | null = null;

export const renderSourcePickerToDom = (
  root: HTMLElement,
  sources: SourceItem[],
  selectedFile: string | undefined,
): void => {
  const selected = selectedSourceFile(sources, selectedFile);
  const existing = bindings.get(root);
  if (existing) {
    existing.update(sources, selected);
    return;
  }
  const binding = new SourcePickerBinding(root, sources, selected);
  bindings.set(root, binding);
};

export const destroySourcePicker = (root: HTMLElement): void => {
  const binding = bindings.get(root);
  if (!binding) {
    return;
  }
  binding.destroy();
  bindings.delete(root);
};

class SourcePickerBinding {
  readonly #root: HTMLElement;
  readonly #nodes: SourcePickerNodes;
  #items: SourcePickerItem[];
  #selected: string;
  #props: Partial<SelectProps<SourcePickerItem>> | null = null;
  #propCleanups: Array<() => void> = [];
  #unsubscribe = (): void => {};
  #destroyed = false;
  #machine: SourcePickerMachine | null = null;
  #runtime: SourcePickerRuntime | null = null;
  #runtimeLoad: Promise<void> | null = null;
  #warmupController = new AbortController();
  #idleWarmupId: number | null = null;

  constructor(root: HTMLElement, sources: SourceItem[], selected: string) {
    this.#root = root;
    this.#items = sources;
    this.#selected = selected;
    this.#nodes = createSourcePickerNodes(root);
    this.#bindWarmupIntent();
    this.#syncLoading();
    this.#scheduleIdleWarmup();
  }

  update(sources: SourceItem[], selected: string): void {
    if (this.#destroyed) {
      return;
    }
    this.#items = sources;
    this.#selected = selected;
    if (!this.#runtime || !this.#machine) {
      this.#syncLoading();
      return;
    }
    this.#props = this.#buildProps(this.#runtime);
    this.#machine.updateProps(() => this.#props ?? {});
    this.#sync();
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#clearProps();
    this.#unsubscribe();
    this.#machine?.stop();
    this.#warmupController.abort();
    if (this.#idleWarmupId !== null) {
      window.clearTimeout(this.#idleWarmupId);
    }
    this.#root.replaceChildren();
  }

  #loadRuntime(): Promise<void> {
    if (this.#runtime) {
      return Promise.resolve();
    }
    if (this.#runtimeLoad) {
      return this.#runtimeLoad;
    }
    this.#nodes.indicator.textContent = "Loading";
    this.#runtimeLoad = this.#installRuntime();
    return this.#runtimeLoad;
  }

  async #installRuntime(): Promise<void> {
    const runtime = await loadSourcePickerRuntime();
    if (this.#destroyed) {
      return;
    }
    this.#runtime = runtime;
    this.#props = this.#buildProps(runtime);
    const machine = new runtime.VanillaMachine(
      runtime.select.machine,
      () => this.#props ?? {},
    ) as SourcePickerMachine;
    this.#machine = machine;
    machine.start();
    this.#unsubscribe = machine.subscribe(() => this.#sync());
    this.#sync();
  }

  #bindWarmupIntent(): void {
    const warmup = (): void => {
      void this.#loadRuntime();
    };
    this.#nodes.trigger.addEventListener("pointerenter", warmup, {
      signal: this.#warmupController.signal,
    });
    this.#nodes.trigger.addEventListener("focus", warmup, {
      signal: this.#warmupController.signal,
    });
    this.#nodes.trigger.addEventListener(
      "click",
      (event) => {
        if (this.#runtime) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void this.#loadRuntime().then(() => {
          if (!this.#destroyed) {
            this.#nodes.trigger.click();
          }
        });
      },
      { signal: this.#warmupController.signal },
    );
  }

  #scheduleIdleWarmup(): void {
    this.#idleWarmupId = window.setTimeout(() => {
      this.#idleWarmupId = null;
      void this.#loadRuntime();
    }, 600);
  }

  #buildProps(runtime: SourcePickerRuntime): Partial<SelectProps<SourcePickerItem>> {
    const selected = this.#selected;
    const root = this.#root;
    return {
      id: "source-picker",
      closeOnSelect: true,
      collection: runtime.select.collection<SourcePickerItem>({
        items: this.#items,
        itemToString: (item) => item.name,
        itemToValue: (item) => item.file,
      }),
      loopFocus: true,
      positioning: {
        placement: "bottom-end",
        sameWidth: true,
      },
      value: selected ? [selected] : [],
      onValueChange({ value }: { value: string[] }) {
        const [sourceFile] = value;
        if (!sourceFile || sourceFile === selected) {
          return;
        }
        root.dispatchEvent(
          new CustomEvent<SourcePickerChangeDetail>(sourcePickerChangeEvent, {
            bubbles: true,
            detail: { sourceFile },
          }),
        );
      },
    };
  }

  #sync(): void {
    if (!this.#runtime || !this.#machine) {
      this.#syncLoading();
      return;
    }
    this.#clearProps();
    const runtime = this.#runtime;
    const api = runtime.select.connect(this.#machine.service, runtime.normalizeProps);
    this.#nodes.trigger.disabled = false;
    this.#nodes.value.textContent = api.valueAsString || "No Org source";
    this.#nodes.indicator.textContent = api.open ? "Close" : "Open";
    this.#nodes.root.dataset.state = api.open ? "open" : "closed";
    this.#nodes.positioner.hidden = !api.open;
    this.#nodes.list.replaceChildren(...(api.open ? this.#renderItems(api) : []));

    this.#propCleanups.push(
      runtime.spreadProps(this.#nodes.root, api.getRootProps()),
      runtime.spreadProps(this.#nodes.label, api.getLabelProps()),
      runtime.spreadProps(this.#nodes.control, api.getControlProps()),
      runtime.spreadProps(this.#nodes.trigger, api.getTriggerProps()),
      runtime.spreadProps(this.#nodes.value, api.getValueTextProps()),
      runtime.spreadProps(this.#nodes.positioner, api.getPositionerProps()),
      runtime.spreadProps(this.#nodes.content, api.getContentProps()),
      runtime.spreadProps(this.#nodes.list, api.getListProps()),
    );
  }

  #syncLoading(): void {
    this.#clearProps();
    this.#nodes.value.textContent = selectedSourceName(this.#items, this.#selected);
    this.#nodes.indicator.textContent = this.#runtimeLoad ? "Loading" : "Load";
    this.#nodes.root.dataset.state = "loading";
    this.#nodes.trigger.disabled = false;
    this.#nodes.positioner.hidden = true;
    this.#nodes.list.replaceChildren();
  }

  #renderItems(api: SourcePickerApi): HTMLElement[] {
    const runtime = this.#runtime;
    if (!runtime) {
      return [];
    }
    return this.#items.map((item) => {
      const state = api.getItemState({ item });
      const node = document.createElement("div");
      const title = document.createElement("span");
      const path = document.createElement("small");
      title.textContent = item.name;
      path.textContent = item.file;
      node.className = "source-select-item";
      node.dataset.selected = String(state.selected);
      node.dataset.highlighted = String(state.highlighted);
      node.append(title, path);
      this.#propCleanups.push(runtime.spreadProps(node, api.getItemProps({ item })));
      return node;
    });
  }

  #clearProps(): void {
    this.#propCleanups.splice(0).forEach((cleanup) => cleanup());
  }
}

const selectedSourceFile = (sources: SourceItem[], selectedFile: string | undefined): string =>
  sources.find((source) => source.file === selectedFile)?.file ?? sources[0]?.file ?? "";

const selectedSourceName = (sources: SourcePickerItem[], selectedFile: string): string =>
  sources.find((source) => source.file === selectedFile)?.name ?? "No Org source";

const loadSourcePickerRuntime = (): Promise<SourcePickerRuntime> => {
  runtimePromise ??= Promise.all([import("@zag-js/select"), import("@zag-js/vanilla")]).then(
    ([select, vanilla]) => ({
      normalizeProps: vanilla.normalizeProps,
      select,
      spreadProps: vanilla.spreadProps,
      VanillaMachine: vanilla.VanillaMachine,
    }),
  );
  return runtimePromise;
};

const createSourcePickerNodes = (root: HTMLElement): SourcePickerNodes => {
  root.replaceChildren();
  const pickerRoot = document.createElement("div");
  const label = document.createElement("span");
  const control = document.createElement("div");
  const trigger = document.createElement("button");
  const value = document.createElement("span");
  const indicator = document.createElement("span");
  const positioner = document.createElement("div");
  const content = document.createElement("div");
  const list = document.createElement("div");

  pickerRoot.className = "source-select-root";
  label.className = "source-picker-label";
  label.textContent = "Source";
  control.className = "source-select-control";
  trigger.className = "source-select";
  trigger.type = "button";
  value.className = "source-select-value";
  indicator.className = "source-select-indicator";
  positioner.className = "source-select-positioner";
  content.className = "source-select-content";
  list.className = "source-select-list";

  trigger.append(value, indicator);
  control.append(trigger);
  content.append(list);
  positioner.append(content);
  pickerRoot.append(label, control, positioner);
  root.append(pickerRoot);

  return { control, content, indicator, label, list, positioner, root: pickerRoot, trigger, value };
};
