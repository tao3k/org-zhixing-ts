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
  largestSourceShardBytes: 800_000,
  initialScriptBytes: 1_500_000,
  initialScriptCount: 4,
  travelPlacesBeforeVirtualization: 80,
  staticManifestParseP50Ms: 15,
  staticManifestParseP95Ms: 80,
  travelProjectionReadP95Ms: 1,
  eagerPhotoSwipeLightbox: false,
  eagerCssLineBreak: false,
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
const sourceShards = await sourceShardInventory();
const sourceShardBreakdown = await sourceShardProjectionBreakdown(sourceShards);
const sourceShardFieldBytes = aggregateShardFieldBytes(sourceShardBreakdown);
const initialScripts = scriptSrcs(indexHtml);
const initialScriptTexts = await Promise.all(
  initialScripts.map((script) => readFile(resolve(distRoot, script), "utf8")),
);
const initialScriptBytes = initialScripts.reduce(
  (sum, script) => sum + (assets.get(script) ?? 0),
  0,
);
const staticManifestParse = sample("staticManifestParse", () => JSON.parse(staticManifestText));
const travelProjectionRead = sample(
  "travelProjectionRead",
  () => staticManifest.travel?.places?.length ?? 0,
);
const runtimeBoundary = await runtimeBoundarySignals();

const metrics = {
  staticManifestBytes: Buffer.byteLength(staticManifestText),
  sourceShardBytes: sourceShards.reduce((sum, shard) => sum + shard.bytes, 0),
  sourceShardCount: sourceShards.length,
  largestSourceShardBytes: sourceShards[0]?.bytes ?? 0,
  largestSourceShard: sourceShards[0]?.path ?? null,
  largestSourceShardFields: sourceShardBreakdown[0]?.fields ?? [],
  sourceShardFieldBytes,
  initialScriptBytes,
  initialScriptCount: initialScripts.length,
  initialScripts,
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
  eagerPhotoSwipeLightbox: initialScriptsContainModule(
    /node_modules\/photoswipe\/dist\/photoswipe-lightbox/,
  ),
  eagerCssLineBreak: initialScriptsContainModule(/node_modules\/css-line-break/),
  eagerTanStackVirtual: initialScriptsContainModule(/node_modules\/@tanstack\/virtual-core/),
  eagerBlogVirtualList: initialScriptsContainModule(/src\/blogVirtualList\.ts/),
  eagerTravelVirtualList: initialScriptsContainModule(/src\/travelVirtualList\.ts/),
  eagerMasonryLayout: initialScriptsContainModule(/node_modules\/masonry-layout/),
  eagerFloatingPanel: initialScriptsContainModule(/node_modules\/@zag-js\/floating-panel/),
  eagerZagSelect: initialScriptsContainModule(/node_modules\/@zag-js\/select/),
  dynamicTanStackChunk: [...assets.keys()].some((script) => /tanstack_virtual-core/.test(script)),
  dynamicBlogVirtualListChunk: [...assets.keys()].some((script) => /blogVirtualList/.test(script)),
  dynamicTravelVirtualListChunk: [...assets.keys()].some((script) =>
    /travelVirtualList/.test(script),
  ),
  dynamicMasonryChunk: [...assets.keys()].some((script) => /masonry-layout/.test(script)),
  dynamicFloatingPanelChunk: [...assets.keys()].some((script) =>
    /zag-js_floating-panel/.test(script),
  ),
  dynamicZagSelectChunk: [...assets.keys()].some((script) => /zag-js_select/.test(script)),
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
  `initial scripts ${metrics.initialScriptCount} files ${formatBytes(metrics.initialScriptBytes)}`,
);
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

function sample(name, fn) {
  for (let index = 0; index < warmups; index += 1) {
    fn();
  }
  const values = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    fn();
    values.push(performance.now() - startedAt);
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
    largestSourceShardBytes: passMetric(
      metrics.largestSourceShardBytes,
      budgetConfig.largestSourceShardBytes,
    ),
    initialScriptBytes: passMetric(metrics.initialScriptBytes, budgetConfig.initialScriptBytes),
    initialScriptCount: passMetric(metrics.initialScriptCount, budgetConfig.initialScriptCount),
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
  const semanticShardBytes =
    (metrics.sourceShardFieldBytes.memory ?? 0) + (metrics.sourceShardFieldBytes.sectionIndex ?? 0);
  if (semanticShardBytes > metrics.sourceShardBytes * 0.5) {
    recommendations.push({
      area: "source-shard-projection-split",
      signal: `memory+sectionIndex account for ${formatBytes(semanticShardBytes)} of ${formatBytes(metrics.sourceShardBytes)} source shards`,
      action:
        "Split memory and semantic section payloads into on-demand shards before scaling the corpus beyond the current demo set.",
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
  return initialScriptTexts.some((script) =>
    [...script.matchAll(/webpack-internal:\/\/\/\.\/([^"\\\n]+)/g)].some((match) =>
      pattern.test(match[1] ?? ""),
    ),
  );
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
