import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distRoot = resolve(projectRoot, "dist");
const reportPath = resolve(
  projectRoot,
  "docs/90_operations/performance-reports/org-zhixing-ui.json",
);
const args = new Map(
  process.argv
    .slice(2)
    .map((arg) => arg.split("="))
    .filter(([key, value]) => key && value)
    .map(([key, value]) => [key.replace(/^--/, ""), value]),
);

const iterations = numberArg("iterations", 100);
const warmups = numberArg("warmups", 5);
const budgets = {
  staticManifestBytes: 500_000,
  sourceShardBytes: 2_000_000,
  agendaShardBytes: 1_000_000,
  attachmentShardBytes: 1_000_000,
  memoryShardBytes: 1_000_000,
  sectionShardBytes: 1_000_000,
  largestSourceShardBytes: 800_000,
  initialScriptBytes: 1_500_000,
  initialScriptCount: 4,
  generatedTailwindCssBytes: 5_000,
  tailwindContentUtilityLeak: false,
  travelPlacesBeforeVirtualization: 80,
  staticManifestParseP50Ms: 15,
  staticManifestParseP95Ms: 80,
  travelProjectionReadP95Ms: 1,
  eagerPhotoSwipeLightbox: false,
  eagerCssLineBreak: false,
  eagerEffectRuntime: false,
  eagerTanStackQueryCore: false,
  eagerReactQuery: false,
  eagerTanStackVirtual: false,
  eagerBlogVirtualList: false,
  eagerTravelVirtualList: false,
  eagerMasonryLayout: false,
  eagerFloatingPanel: false,
  eagerZagSelect: false,
  lazyParserWorker: true,
  staticSiteWideSourceDeferral: true,
  deferredSourcePickerRuntime: true,
  idleInteractionChunkPrefetch: true,
};

const indexHtml = await readFile(resolve(distRoot, "index.html"), "utf8");
const staticManifestText = await readFile(resolve(distRoot, "org-zhixing.static.json"), "utf8");
const staticManifest = JSON.parse(staticManifestText);
const assets = await assetInventory();
const scriptTexts = await scriptTextInventory(assets);
const sourceShards = await sourceShardInventory();
const agendaShards = await agendaShardInventory();
const attachmentShards = await attachmentShardInventory();
const memoryShards = await memoryShardInventory();
const sectionShards = await sectionShardInventory();
const sourceShardBreakdown = await sourceShardProjectionBreakdown(sourceShards);
const agendaShardBreakdown = await sourceShardProjectionBreakdown(agendaShards);
const attachmentShardBreakdown = await sourceShardProjectionBreakdown(attachmentShards);
const memoryShardBreakdown = await sourceShardProjectionBreakdown(memoryShards);
const sectionShardBreakdown = await sourceShardProjectionBreakdown(sectionShards);
const sourceShardFieldBytes = aggregateShardFieldBytes(sourceShardBreakdown);
const agendaShardFieldBytes = aggregateShardFieldBytes(agendaShardBreakdown);
const attachmentShardFieldBytes = aggregateShardFieldBytes(attachmentShardBreakdown);
const memoryShardFieldBytes = aggregateShardFieldBytes(memoryShardBreakdown);
const sectionShardFieldBytes = aggregateShardFieldBytes(sectionShardBreakdown);
const initialScripts = scriptSrcs(indexHtml);
const initialScriptTexts = initialScripts.map((script) => scriptTexts.get(script) ?? "");
const initialScriptBytes = initialScripts.reduce(
  (sum, script) => sum + (assets.get(script) ?? 0),
  0,
);
const generatedTailwindCssText = await readFile(
  resolve(projectRoot, ".cache/org-zhixing/tailwind.css"),
  "utf8",
);
const staticManifestParse = sample("staticManifestParse", () => JSON.parse(staticManifestText), {
  batchSize: 20,
});
const travelProjectionRead = sample(
  "travelProjectionRead",
  () => staticManifest.travel?.places?.length ?? 0,
);
const runtimeBoundary = await runtimeBoundarySignals();

const metrics = {
  staticManifestBytes: Buffer.byteLength(staticManifestText),
  sourceShardBytes: sourceShards.reduce((sum, shard) => sum + shard.bytes, 0),
  sourceShardCount: sourceShards.length,
  agendaShardBytes: agendaShards.reduce((sum, shard) => sum + shard.bytes, 0),
  agendaShardCount: agendaShards.length,
  largestAgendaShardBytes: agendaShards[0]?.bytes ?? 0,
  largestAgendaShard: agendaShards[0]?.path ?? null,
  attachmentShardBytes: attachmentShards.reduce((sum, shard) => sum + shard.bytes, 0),
  attachmentShardCount: attachmentShards.length,
  largestAttachmentShardBytes: attachmentShards[0]?.bytes ?? 0,
  largestAttachmentShard: attachmentShards[0]?.path ?? null,
  memoryShardBytes: memoryShards.reduce((sum, shard) => sum + shard.bytes, 0),
  memoryShardCount: memoryShards.length,
  largestMemoryShardBytes: memoryShards[0]?.bytes ?? 0,
  largestMemoryShard: memoryShards[0]?.path ?? null,
  sectionShardBytes: sectionShards.reduce((sum, shard) => sum + shard.bytes, 0),
  sectionShardCount: sectionShards.length,
  largestSectionShardBytes: sectionShards[0]?.bytes ?? 0,
  largestSectionShard: sectionShards[0]?.path ?? null,
  largestSourceShardBytes: sourceShards[0]?.bytes ?? 0,
  largestSourceShard: sourceShards[0]?.path ?? null,
  largestSourceShardFields: sourceShardBreakdown[0]?.fields ?? [],
  sourceShardFieldBytes,
  agendaShardFieldBytes,
  attachmentShardFieldBytes,
  memoryShardFieldBytes,
  sectionShardFieldBytes,
  initialScriptBytes,
  initialScriptCount: initialScripts.length,
  initialScripts,
  generatedTailwindCssBytes: Buffer.byteLength(generatedTailwindCssText),
  tailwindContentUtilityLeak: tailwindContentUtilityLeak(generatedTailwindCssText),
  parserWorkerScriptBytes: assetBytesMatching(/orgize_worker_js/),
  wasmAssetBytes: assetBytesMatching(/orgize_bg\..+\.wasm$/),
  largestAsyncAssets: largestAsyncAssets(initialScripts, assets, 8),
  blogArticles: staticManifest.blog?.articleCount ?? 0,
  blogSourceCount: staticManifest.blog?.sourceCount ?? 0,
  blogTagFacetCount: staticManifest.blog?.tagFacets?.length ?? 0,
  blogTravelArticles:
    staticManifest.blog?.articles?.filter((article) => article.sourceFile === "blog/travel.org")
      .length ?? 0,
  travelPlaces: staticManifest.travel?.places?.length ?? 0,
  travelSourceCount: staticManifest.travel?.sourceCount ?? 0,
  travelScannedSourceCount: staticManifest.travel?.scannedSourceCount ?? 0,
  travelRegions: staticManifest.travel?.regions?.length ?? 0,
  eagerPhotoSwipeLightbox: initialScriptsContainModule(/PhotoSwipe|photoswipe/i),
  eagerCssLineBreak: initialScriptsContainModule(/css-line-break|LineBreaker/),
  eagerEffectRuntime: initialScriptsContainModule(/effect\/GlobalValue|effect\/Effect/),
  eagerTanStackQueryCore: initialScriptsContainModule(/QueryCache|MutationCache|notifyManager/),
  eagerReactQuery: initialScriptsContainModule(/QueryClientProvider|useBaseQuery|useQuery/),
  eagerTanStackVirtual: initialScriptsContainModule(/Virtualizer|observeElementRect/),
  eagerBlogVirtualList: initialScriptsContainModule(/blogVirtualized|blog-virtual-spacer/),
  eagerTravelVirtualList: initialScriptsContainModule(/travelVirtualized|travel-virtual-spacer/),
  eagerMasonryLayout: initialScriptsContainModule(/Masonry|masonry-layout/),
  eagerFloatingPanel: initialScriptsContainModule(/floating-panel|data-floating/),
  eagerZagSelect: initialScriptsContainModule(/source-select|select\.machine|data-part/),
  dynamicTanStackChunk: asyncScriptsContainModule(/Virtualizer|observeElementRect/),
  dynamicEffectRuntimeChunk: asyncScriptsContainModule(/effect\/GlobalValue|effect\/Effect/),
  dynamicTanStackQueryChunk: asyncScriptsContainModule(/QueryCache|MutationCache|notifyManager/),
  dynamicReactQueryChunk: asyncScriptsContainModule(/QueryClientProvider|useBaseQuery|useQuery/),
  dynamicBlogVirtualListChunk: asyncScriptsContainModule(/blogVirtualized|blog-virtual-spacer/),
  dynamicTravelVirtualListChunk: asyncScriptsContainModule(
    /travelVirtualized|travel-virtual-spacer/,
  ),
  dynamicMasonryChunk: asyncScriptsContainModule(/Masonry|masonry-layout/),
  dynamicFloatingPanelChunk: asyncScriptsContainModule(/floating-panel|data-floating/),
  dynamicZagSelectChunk: asyncScriptsContainModule(/source-select|select\.machine|data-part/),
  lazyParserWorker: runtimeBoundary.lazyParserWorker,
  staticSiteWideSourceDeferral: runtimeBoundary.staticSiteWideSourceDeferral,
  deferredSourcePickerRuntime: runtimeBoundary.deferredSourcePickerRuntime,
  idleInteractionChunkPrefetch: runtimeBoundary.idleInteractionChunkPrefetch,
  staticManifestParse,
  travelProjectionRead,
};
const report = {
  schemaVersion: 1,
  kind: "org-zhixing-ui-performance",
  source: "dist",
  iterations,
  warmups,
  budgets,
  metrics,
  budgetResults: evaluateBudgets(metrics, budgets),
  recommendations: recommendationsFor(metrics),
};

await mkdir(resolve(projectRoot, "docs/90_operations/performance-reports"), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("org-zhixing ui perf (dist)");
console.log(`static manifest ${formatBytes(metrics.staticManifestBytes)}`);
console.log(
  `source shards ${metrics.sourceShardCount} files ${formatBytes(metrics.sourceShardBytes)}`,
);
console.log(
  `agenda shards ${metrics.agendaShardCount} files ${formatBytes(metrics.agendaShardBytes)}`,
);
console.log(
  `attachment shards ${metrics.attachmentShardCount} files ${formatBytes(metrics.attachmentShardBytes)}`,
);
console.log(
  `memory shards ${metrics.memoryShardCount} files ${formatBytes(metrics.memoryShardBytes)}`,
);
console.log(
  `section shards ${metrics.sectionShardCount} files ${formatBytes(metrics.sectionShardBytes)}`,
);
console.log(
  `initial scripts ${metrics.initialScriptCount} files ${formatBytes(metrics.initialScriptBytes)}`,
);
console.log(`tailwind utilities ${formatBytes(metrics.generatedTailwindCssBytes)}`);
console.log(`blog ${metrics.blogArticles} Org files from ${metrics.blogSourceCount} Org files`);
console.log(
  `static manifest parse p50 ${formatMs(staticManifestParse.p50Ms)} p95 ${formatMs(
    staticManifestParse.p95Ms,
  )}`,
);
console.log(
  `travel projection read p50 ${formatMs(travelProjectionRead.p50Ms)} p95 ${formatMs(
    travelProjectionRead.p95Ms,
  )}`,
);
console.log(`travel ${metrics.travelPlaces} places across ${metrics.travelRegions} regions`);
console.log(`artifact ${reportPath}`);

const failures = failedBudgets(report.budgetResults);
if (failures.length > 0) {
  console.error(`budget failures: ${failures.join(", ")}`);
  process.exitCode = 1;
}

async function assetInventory() {
  const assetsRoot = resolve(distRoot, "assets");
  const entries = await readdir(assetsRoot);
  const sizes = new Map();
  for (const entry of entries) {
    const path = resolve(assetsRoot, entry);
    const item = await stat(path);
    if (item.isFile()) {
      sizes.set(`assets/${entry}`, item.size);
    }
  }
  return sizes;
}

async function scriptTextInventory(assetMap) {
  const texts = new Map();
  await Promise.all(
    [...assetMap.keys()]
      .filter((path) => path.endsWith(".js"))
      .map(async (path) => {
        texts.set(path, await readFile(resolve(distRoot, path), "utf8"));
      }),
  );
  return texts;
}

async function sourceShardInventory() {
  const shardRoot = resolve(distRoot, "org-zhixing.sources");
  try {
    const entries = await readdir(shardRoot);
    const sizes = [];
    for (const entry of entries) {
      const path = resolve(shardRoot, entry);
      const item = await stat(path);
      if (item.isFile()) {
        sizes.push({ path: `org-zhixing.sources/${entry}`, bytes: item.size });
      }
    }
    return sizes.sort((left, right) => right.bytes - left.bytes);
  } catch {
    return [];
  }
}

async function agendaShardInventory() {
  const shardRoot = resolve(distRoot, "org-zhixing.agenda");
  try {
    const entries = await readdir(shardRoot);
    const sizes = [];
    for (const entry of entries) {
      const path = resolve(shardRoot, entry);
      const item = await stat(path);
      if (item.isFile()) {
        sizes.push({ path: `org-zhixing.agenda/${entry}`, bytes: item.size });
      }
    }
    return sizes.sort((left, right) => right.bytes - left.bytes);
  } catch {
    return [];
  }
}

async function attachmentShardInventory() {
  const shardRoot = resolve(distRoot, "org-zhixing.attachments");
  try {
    const entries = await readdir(shardRoot);
    const sizes = [];
    for (const entry of entries) {
      const path = resolve(shardRoot, entry);
      const item = await stat(path);
      if (item.isFile()) {
        sizes.push({ path: `org-zhixing.attachments/${entry}`, bytes: item.size });
      }
    }
    return sizes.sort((left, right) => right.bytes - left.bytes);
  } catch {
    return [];
  }
}

async function memoryShardInventory() {
  const shardRoot = resolve(distRoot, "org-zhixing.memory");
  try {
    const entries = await readdir(shardRoot);
    const sizes = [];
    for (const entry of entries) {
      const path = resolve(shardRoot, entry);
      const item = await stat(path);
      if (item.isFile()) {
        sizes.push({ path: `org-zhixing.memory/${entry}`, bytes: item.size });
      }
    }
    return sizes.sort((left, right) => right.bytes - left.bytes);
  } catch {
    return [];
  }
}

async function sectionShardInventory() {
  const shardRoot = resolve(distRoot, "org-zhixing.sections");
  try {
    const entries = await readdir(shardRoot);
    const sizes = [];
    for (const entry of entries) {
      const path = resolve(shardRoot, entry);
      const item = await stat(path);
      if (item.isFile()) {
        sizes.push({ path: `org-zhixing.sections/${entry}`, bytes: item.size });
      }
    }
    return sizes.sort((left, right) => right.bytes - left.bytes);
  } catch {
    return [];
  }
}

async function sourceShardProjectionBreakdown(shards) {
  const breakdown = [];
  for (const shard of shards) {
    const value = JSON.parse(await readFile(resolve(distRoot, shard.path), "utf8"));
    const fields = Object.entries(value)
      .map(([field, fieldValue]) => ({
        field,
        bytes: Buffer.byteLength(JSON.stringify(fieldValue ?? null)),
      }))
      .sort((left, right) => right.bytes - left.bytes);
    breakdown.push({
      path: shard.path,
      bytes: shard.bytes,
      fields: fields.slice(0, 10),
    });
  }
  return breakdown;
}

function aggregateShardFieldBytes(shards) {
  const totals = new Map();
  for (const shard of shards) {
    for (const field of shard.fields) {
      totals.set(field.field, (totals.get(field.field) ?? 0) + field.bytes);
    }
  }
  return Object.fromEntries([...totals.entries()].sort((left, right) => right[1] - left[1]));
}

async function runtimeBoundarySignals() {
  const [appSource, appEventsSource, clientSource, sourcePickerSource] = await Promise.all([
    readFile(resolve(projectRoot, "src/app.ts"), "utf8"),
    readFile(resolve(projectRoot, "src/appEvents.ts"), "utf8"),
    readFile(resolve(projectRoot, "src/orgizeClient.ts"), "utf8"),
    readFile(resolve(projectRoot, "src/sourcePicker.ts"), "utf8"),
  ]);
  const sourcePickerConstructor =
    sourcePickerSource.match(
      /constructor\(root: HTMLElement, sources: SourceItem\[\], selected: string\) \{([\s\S]*?)\n  \}/,
    )?.[1] ?? "";
  return {
    lazyParserWorker:
      clientSource.includes("#workerForRequest()") &&
      !clientSource.includes("this.#worker = options.createWorker();"),
    staticSiteWideSourceDeferral:
      appSource.includes("#viewNeedsActiveSource()") &&
      appSource.includes("#canRenderStaticSiteWideView()"),
    deferredSourcePickerRuntime:
      sourcePickerSource.includes("#scheduleIdleWarmup()") &&
      !sourcePickerConstructor.includes("#loadRuntime"),
    idleInteractionChunkPrefetch:
      appEventsSource.includes("scheduleIdleImport") &&
      appEventsSource.includes("prefetchTravelGlanceRuntime"),
  };
}

function scriptSrcs(html) {
  return [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
}

function sample(name, fn, options = {}) {
  const batchSize = options.batchSize ?? 1;
  for (let index = 0; index < warmups; index += 1) {
    for (let batch = 0; batch < batchSize; batch += 1) {
      fn();
    }
  }
  const values = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    for (let batch = 0; batch < batchSize; batch += 1) {
      fn();
    }
    values.push((performance.now() - startedAt) / batchSize);
  }
  values.sort((left, right) => left - right);
  return {
    name,
    minMs: round(values[0] ?? 0),
    p50Ms: round(percentile(values, 0.5)),
    p95Ms: round(percentile(values, 0.95)),
    maxMs: round(values.at(-1) ?? 0),
    avgMs: round(values.reduce((sum, value) => sum + value, 0) / values.length),
  };
}

function evaluateBudgets(metrics, budgetConfig) {
  return {
    staticManifestBytes: passMetric(metrics.staticManifestBytes, budgetConfig.staticManifestBytes),
    sourceShardBytes: passMetric(metrics.sourceShardBytes, budgetConfig.sourceShardBytes),
    agendaShardBytes: passMetric(metrics.agendaShardBytes, budgetConfig.agendaShardBytes),
    attachmentShardBytes: passMetric(
      metrics.attachmentShardBytes,
      budgetConfig.attachmentShardBytes,
    ),
    memoryShardBytes: passMetric(metrics.memoryShardBytes, budgetConfig.memoryShardBytes),
    sectionShardBytes: passMetric(metrics.sectionShardBytes, budgetConfig.sectionShardBytes),
    largestSourceShardBytes: passMetric(
      metrics.largestSourceShardBytes,
      budgetConfig.largestSourceShardBytes,
    ),
    initialScriptBytes: passMetric(metrics.initialScriptBytes, budgetConfig.initialScriptBytes),
    initialScriptCount: passMetric(metrics.initialScriptCount, budgetConfig.initialScriptCount),
    generatedTailwindCssBytes: passMetric(
      metrics.generatedTailwindCssBytes,
      budgetConfig.generatedTailwindCssBytes,
    ),
    tailwindContentUtilityLeak: {
      actual: metrics.tailwindContentUtilityLeak,
      budget: budgetConfig.tailwindContentUtilityLeak,
      pass: metrics.tailwindContentUtilityLeak === budgetConfig.tailwindContentUtilityLeak,
    },
    staticManifestParseP50Ms: passMetric(
      metrics.staticManifestParse.p50Ms,
      budgetConfig.staticManifestParseP50Ms,
    ),
    staticManifestParseP95Ms: passMetric(
      metrics.staticManifestParse.p95Ms,
      budgetConfig.staticManifestParseP95Ms,
    ),
    travelProjectionReadP95Ms: passMetric(
      metrics.travelProjectionRead.p95Ms,
      budgetConfig.travelProjectionReadP95Ms,
    ),
    eagerPhotoSwipeLightbox: {
      actual: metrics.eagerPhotoSwipeLightbox,
      budget: budgetConfig.eagerPhotoSwipeLightbox,
      pass: metrics.eagerPhotoSwipeLightbox === budgetConfig.eagerPhotoSwipeLightbox,
    },
    eagerCssLineBreak: {
      actual: metrics.eagerCssLineBreak,
      budget: budgetConfig.eagerCssLineBreak,
      pass: metrics.eagerCssLineBreak === budgetConfig.eagerCssLineBreak,
    },
    eagerEffectRuntime: {
      actual: metrics.eagerEffectRuntime,
      budget: budgetConfig.eagerEffectRuntime,
      pass: metrics.eagerEffectRuntime === budgetConfig.eagerEffectRuntime,
    },
    travelVirtualizationThreshold: {
      actual: metrics.travelPlaces,
      budget: budgetConfig.travelPlacesBeforeVirtualization,
      pass: metrics.travelPlaces < budgetConfig.travelPlacesBeforeVirtualization,
    },
    eagerTanStackVirtual: {
      actual: metrics.eagerTanStackVirtual,
      budget: budgetConfig.eagerTanStackVirtual,
      pass: metrics.eagerTanStackVirtual === budgetConfig.eagerTanStackVirtual,
    },
    eagerTanStackQueryCore: {
      actual: metrics.eagerTanStackQueryCore,
      budget: budgetConfig.eagerTanStackQueryCore,
      pass: metrics.eagerTanStackQueryCore === budgetConfig.eagerTanStackQueryCore,
    },
    eagerReactQuery: {
      actual: metrics.eagerReactQuery,
      budget: budgetConfig.eagerReactQuery,
      pass: metrics.eagerReactQuery === budgetConfig.eagerReactQuery,
    },
    eagerBlogVirtualList: {
      actual: metrics.eagerBlogVirtualList,
      budget: budgetConfig.eagerBlogVirtualList,
      pass: metrics.eagerBlogVirtualList === budgetConfig.eagerBlogVirtualList,
    },
    eagerTravelVirtualList: {
      actual: metrics.eagerTravelVirtualList,
      budget: budgetConfig.eagerTravelVirtualList,
      pass: metrics.eagerTravelVirtualList === budgetConfig.eagerTravelVirtualList,
    },
    eagerMasonryLayout: {
      actual: metrics.eagerMasonryLayout,
      budget: budgetConfig.eagerMasonryLayout,
      pass: metrics.eagerMasonryLayout === budgetConfig.eagerMasonryLayout,
    },
    eagerFloatingPanel: {
      actual: metrics.eagerFloatingPanel,
      budget: budgetConfig.eagerFloatingPanel,
      pass: metrics.eagerFloatingPanel === budgetConfig.eagerFloatingPanel,
    },
    eagerZagSelect: {
      actual: metrics.eagerZagSelect,
      budget: budgetConfig.eagerZagSelect,
      pass: metrics.eagerZagSelect === budgetConfig.eagerZagSelect,
    },
    lazyParserWorker: {
      actual: metrics.lazyParserWorker,
      budget: budgetConfig.lazyParserWorker,
      pass: metrics.lazyParserWorker === budgetConfig.lazyParserWorker,
    },
    staticSiteWideSourceDeferral: {
      actual: metrics.staticSiteWideSourceDeferral,
      budget: budgetConfig.staticSiteWideSourceDeferral,
      pass: metrics.staticSiteWideSourceDeferral === budgetConfig.staticSiteWideSourceDeferral,
    },
    deferredSourcePickerRuntime: {
      actual: metrics.deferredSourcePickerRuntime,
      budget: budgetConfig.deferredSourcePickerRuntime,
      pass: metrics.deferredSourcePickerRuntime === budgetConfig.deferredSourcePickerRuntime,
    },
    idleInteractionChunkPrefetch: {
      actual: metrics.idleInteractionChunkPrefetch,
      budget: budgetConfig.idleInteractionChunkPrefetch,
      pass: metrics.idleInteractionChunkPrefetch === budgetConfig.idleInteractionChunkPrefetch,
    },
  };
}

function passMetric(actual, budget) {
  return { actual, budget, pass: actual <= budget };
}

function recommendationsFor(metrics) {
  const recommendations = [];
  if (metrics.staticManifestBytes > 1_000_000) {
    recommendations.push({
      area: "static-manifest",
      signal: `static manifest is ${formatBytes(metrics.staticManifestBytes)}`,
      action:
        "Consider splitting the static manifest by view or source once navigation needs faster JSON parse.",
    });
  }
  if (metrics.sourceShardCount > 0 && metrics.staticManifestBytes < 500_000) {
    recommendations.push({
      area: "static-manifest-shards",
      signal: `entry manifest is ${formatBytes(metrics.staticManifestBytes)}; ${metrics.sourceShardCount} source shards are ${formatBytes(metrics.sourceShardBytes)}`,
      action:
        "Keep site-wide Gallery and Travel on compact projections; load full source shards only for source-scoped or Records views.",
    });
  }
  const sourceMemoryBytes = metrics.sourceShardFieldBytes.memory ?? 0;
  if (sourceMemoryBytes > 0) {
    recommendations.push({
      area: "static-memory-shard-split",
      signal: `memory still accounts for ${formatBytes(sourceMemoryBytes)} inside source shards`,
      action:
        "Keep memory as an on-demand shard so normal source projections do not load the agent-memory payload.",
    });
  }
  if (metrics.memoryShardCount > 0 && sourceMemoryBytes === 0) {
    recommendations.push({
      area: "static-memory-shards",
      signal: `${metrics.memoryShardCount} memory shards are ${formatBytes(metrics.memoryShardBytes)} and source shards contain no memory field`,
      action:
        "Keep Memory view on the dedicated shard path; do not merge memory back into source shards for Blog, Gallery, Records, or Travel.",
    });
  }
  const agendaBytes = metrics.sourceShardFieldBytes.agendaView ?? 0;
  if (agendaBytes > 0) {
    recommendations.push({
      area: "agenda-view-shard-split",
      signal: `agendaView still accounts for ${formatBytes(agendaBytes)} inside source shards`,
      action:
        "Keep agendaView as an on-demand shard so source-scoped Blog and Records can load without agenda metadata.",
    });
  }
  if (metrics.agendaShardCount > 0 && agendaBytes === 0) {
    recommendations.push({
      area: "static-agenda-shards",
      signal: `${metrics.agendaShardCount} agenda shards are ${formatBytes(metrics.agendaShardBytes)} and source shards contain no agendaView field`,
      action:
        "Keep Agenda on the agenda-shard path while preserving lighter source shards for Blog, Records, and static article reads.",
    });
  }
  const sectionIndexBytes = metrics.sourceShardFieldBytes.sectionIndex ?? 0;
  if (sectionIndexBytes > 0) {
    recommendations.push({
      area: "section-index-shard-split",
      signal: `sectionIndex still accounts for ${formatBytes(sectionIndexBytes)} inside source shards`,
      action:
        "Keep sectionIndex as an on-demand shard so Blog index, Gallery, Travel, and Agenda do not load semantic section payloads.",
    });
  }
  if (metrics.sectionShardCount > 0 && sectionIndexBytes === 0) {
    recommendations.push({
      area: "static-section-shards",
      signal: `${metrics.sectionShardCount} section shards are ${formatBytes(metrics.sectionShardBytes)} and source shards contain no sectionIndex field`,
      action:
        "Keep Records, Memory, and Zen article rendering on the section-shard path while preserving lighter source shards for other views.",
    });
  }
  const attachmentBytes = metrics.sourceShardFieldBytes.attachmentInventory ?? 0;
  if (attachmentBytes > 0) {
    recommendations.push({
      area: "attachment-inventory-shard-split",
      signal: `attachmentInventory still accounts for ${formatBytes(attachmentBytes)} inside source shards`,
      action:
        "Keep attachmentInventory as an on-demand shard so source-scoped Blog and Agenda can load without gallery metadata.",
    });
  }
  if (metrics.attachmentShardCount > 0 && attachmentBytes === 0) {
    recommendations.push({
      area: "static-attachment-shards",
      signal: `${metrics.attachmentShardCount} attachment shards are ${formatBytes(metrics.attachmentShardBytes)} and source shards contain no attachmentInventory field`,
      action:
        "Keep Gallery, Notes, Memory, and Zen link rewriting on the attachment-shard path while preserving lighter source shards for other views.",
    });
  }
  if (metrics.sourceShardCount > 0 && metrics.blogSourceCount < metrics.sourceShardCount) {
    recommendations.push({
      area: "blog-source-coverage",
      signal: `Blog covers ${metrics.blogSourceCount} of ${metrics.sourceShardCount} discovered Org sources`,
      action:
        "Keep Blog admission on discovered Org files so configured files do not disappear behind tag filters.",
    });
  }
  if (metrics.largestSourceShardBytes > 500_000) {
    recommendations.push({
      area: "source-shard-size",
      signal: `${metrics.largestSourceShard} is ${formatBytes(metrics.largestSourceShardBytes)}`,
      action:
        "Split large source shards by projection if Records, Blog, and Agenda begin needing independent load paths.",
    });
  }
  if (metrics.staticManifestParse.p95Ms > 20) {
    recommendations.push({
      area: "static-manifest-parse",
      signal: `static manifest parse p95 is ${formatMs(metrics.staticManifestParse.p95Ms)}`,
      action:
        "Prefer a per-view/per-source static manifest shard before adding more generated projections.",
    });
  }
  if (metrics.initialScriptBytes > 1_000_000) {
    recommendations.push({
      area: "initial-bundle",
      signal: `initial scripts total ${formatBytes(metrics.initialScriptBytes)}`,
      action:
        "Inspect the shared vendor chunk and keep TanStack Virtual, parser runtime, and map code out of eager scripts.",
    });
  }
  if (!metrics.eagerTanStackQueryCore && metrics.dynamicTanStackQueryChunk) {
    recommendations.push({
      area: "static-shard-query-runtime",
      signal: "TanStack Query Core stays behind the static shard boundary",
      action:
        "Keep query caching for source/agenda/attachment/memory/section shards lazy so static manifest-only refreshes do not pay the query runtime.",
    });
  }
  if (!metrics.eagerReactQuery && metrics.dynamicReactQueryChunk) {
    recommendations.push({
      area: "react-query-route-boundary",
      signal: "TanStack React Query is available as a route/data chunk instead of eager boot code",
      action:
        "Keep React Query behind route loaders until native React views consume static shards directly.",
    });
  }
  if (!metrics.eagerEffectRuntime && metrics.dynamicEffectRuntimeChunk) {
    recommendations.push({
      area: "typed-async-effect-runtime",
      signal: "Effect stays behind the static shard async boundary",
      action:
        "Keep typed async fetch/error handling out of the static entry path; use it at domain boundaries where failure shape matters.",
    });
  }
  if (!metrics.eagerEffectRuntime && !metrics.dynamicEffectRuntimeChunk) {
    recommendations.push({
      area: "typed-async-effect-node-boundary",
      signal: "Effect is absent from browser assets",
      action:
        "Keep Effect on static generation and other Node orchestration boundaries until the browser bundle cost is justified by a domain effect surface.",
    });
  }
  if (metrics.generatedTailwindCssBytes > 0) {
    recommendations.push({
      area: "tailwind-design-token-runtime",
      signal: `generated Tailwind utilities are ${formatBytes(metrics.generatedTailwindCssBytes)}`,
      action:
        "Keep Tailwind on token-backed Org semantic atoms first, then migrate repeated hand-written component rules when the utility form is clearer.",
    });
  }
  if (!metrics.tailwindContentUtilityLeak) {
    recommendations.push({
      area: "tailwind-source-boundary",
      signal: "Tailwind source scanning is disabled for user/exported content classes",
      action:
        "Keep source(none) on the Tailwind utilities import so exported Org HTML classes do not silently become design-system utilities.",
    });
  }
  if (metrics.parserWorkerScriptBytes > 0 && metrics.lazyParserWorker) {
    recommendations.push({
      area: "parser-worker-startup",
      signal: `parser worker chunk is ${formatBytes(metrics.parserWorkerScriptBytes)} and wasm is ${formatBytes(metrics.wasmAssetBytes)}`,
      action:
        "Keep the Org parser worker lazy so static Blog, Gallery, and Travel entry views do not fetch parser runtime before a source-scoped view needs it.",
    });
  }
  if (metrics.staticSiteWideSourceDeferral) {
    recommendations.push({
      area: "site-wide-static-startup",
      signal: "static site-wide views can render from the entry manifest",
      action:
        "Keep Blog index, Gallery, and Travel from loading the active source shard during boot; source shards should start at Zen/article or source-scoped views.",
    });
  }
  if (metrics.deferredSourcePickerRuntime) {
    recommendations.push({
      area: "source-picker-first-interaction",
      signal:
        "Zag Select is warmed on intent/idle instead of imported during source picker construction",
      action:
        "Keep the styled source picker runtime off the boot path while prefetching it before the first deliberate picker open.",
    });
  }
  if (metrics.idleInteractionChunkPrefetch) {
    recommendations.push({
      area: "interaction-prefetch",
      signal:
        "Gallery lightbox and Travel Glance chunks are prefetched after the relevant DOM appears",
      action:
        "Continue moving heavy first-interaction chunks to intent/idle prefetch boundaries instead of eager imports.",
    });
  }
  if (metrics.largestAsyncAssets.length > 0) {
    const largest = metrics.largestAsyncAssets[0];
    recommendations.push({
      area: "first-interaction-chunks",
      signal: `largest async chunk is ${largest.path} at ${formatBytes(largest.bytes)}`,
      action:
        "For slow first interactions, prefetch the route-relevant chunk after idle instead of moving large TS dependencies into initial scripts.",
    });
  }
  if (metrics.eagerPhotoSwipeLightbox) {
    recommendations.push({
      area: "attachment-gallery",
      signal: "PhotoSwipe lightbox is present in eager initial scripts",
      action: "Load the attachment viewer only after image-backed attachment openers are present.",
    });
  }
  if (metrics.eagerCssLineBreak) {
    recommendations.push({
      area: "typographic-text",
      signal: "css-line-break runtime is present in eager initial scripts",
      action:
        "Use native segmentation or a small deterministic splitter for memory/link soft wrapping.",
    });
  }
  if (metrics.dynamicTanStackChunk && !metrics.eagerTanStackVirtual) {
    recommendations.push({
      area: "virtual-list-boundary",
      signal: "TanStack Virtual exists only as an on-demand chunk",
      action:
        "Keep Blog and Travel lists below their virtualization thresholds on the plain static CSS path.",
    });
  }
  if (metrics.dynamicFloatingPanelChunk && !metrics.eagerFloatingPanel) {
    recommendations.push({
      area: "zen-glance-window-runtime",
      signal: "Zag Floating Panel exists only as an on-demand chunk",
      action:
        "Keep Zen Glance window control behind the card-open boundary instead of adding it to initial navigation.",
    });
  }
  if (metrics.dynamicZagSelectChunk && !metrics.eagerZagSelect) {
    recommendations.push({
      area: "source-picker-runtime",
      signal: "Zag Select exists only as an on-demand chunk",
      action:
        "Keep the styled source picker out of initial scripts while preserving the non-native select surface.",
    });
  }
  return recommendations;
}

function failedBudgets(results) {
  return Object.entries(results)
    .filter(([, result]) => !result.pass)
    .map(([name, result]) => `${name} ${result.actual} > ${result.budget}`);
}

function initialScriptsContainModule(pattern) {
  return initialScriptTexts.some((script) => pattern.test(script));
}

function asyncScriptsContainModule(pattern) {
  const initial = new Set(initialScripts);
  return [...scriptTexts.entries()].some(
    ([path, text]) => !initial.has(path) && pattern.test(text),
  );
}

function tailwindContentUtilityLeak(css) {
  return /\.(?:container|mb-4|grid|block|hidden|table|font-mono|font-sans)\b/.test(css);
}

function assetBytesMatching(pattern) {
  return [...assets.entries()]
    .filter(([path]) => pattern.test(path))
    .reduce((sum, [, bytes]) => sum + bytes, 0);
}

function largestAsyncAssets(initial, assetMap, limit) {
  const initialSet = new Set(initial);
  return [...assetMap.entries()]
    .filter(([path]) => path.endsWith(".js") && !initialSet.has(path))
    .map(([path, bytes]) => ({ path, bytes }))
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, limit);
}

function percentile(values, ratio) {
  if (values.length === 0) {
    return 0;
  }
  const index = Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1);
  return values[index];
}

function numberArg(name, fallback) {
  const value = Number(args.get(name) ?? process.env[`ORG_ZHIXING_${name.toUpperCase()}`]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function formatMs(value) {
  return `${value.toFixed(value < 10 ? 2 : 1)}ms`;
}

function formatBytes(value) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KiB`;
  }
  return `${Math.round((value / 1024 / 1024) * 10) / 10} MiB`;
}
