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
  eagerTravelVirtualList: false,
};

const indexHtml = await readFile(resolve(distRoot, "index.html"), "utf8");
const staticManifestText = await readFile(resolve(distRoot, "org-zhixing.static.json"), "utf8");
const staticManifest = JSON.parse(staticManifestText);
const assets = await assetInventory();
const sourceShards = await sourceShardInventory();
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

const metrics = {
  staticManifestBytes: Buffer.byteLength(staticManifestText),
  sourceShardBytes: sourceShards.reduce((sum, shard) => sum + shard.bytes, 0),
  sourceShardCount: sourceShards.length,
  largestSourceShardBytes: sourceShards[0]?.bytes ?? 0,
  largestSourceShard: sourceShards[0]?.path ?? null,
  initialScriptBytes,
  initialScriptCount: initialScripts.length,
  initialScripts,
  travelPlaces: staticManifest.travel?.places?.length ?? 0,
  travelSourceCount: staticManifest.travel?.sourceCount ?? 0,
  travelScannedSourceCount: staticManifest.travel?.scannedSourceCount ?? 0,
  travelRegions: staticManifest.travel?.regions?.length ?? 0,
  eagerPhotoSwipeLightbox: initialScriptsContainModule(
    /node_modules\/photoswipe\/dist\/photoswipe-lightbox/,
  ),
  eagerCssLineBreak: initialScriptsContainModule(/node_modules\/css-line-break/),
  eagerTanStackVirtual: initialScriptsContainModule(/node_modules\/@tanstack\/virtual-core/),
  eagerTravelVirtualList: initialScriptsContainModule(/src\/travelVirtualList\.ts/),
  dynamicTanStackChunk: [...assets.keys()].some((script) => /tanstack_virtual-core/.test(script)),
  dynamicTravelVirtualListChunk: [...assets.keys()].some((script) =>
    /travelVirtualList/.test(script),
  ),
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
    eagerTravelVirtualList: {
      actual: metrics.eagerTravelVirtualList,
      budget: budgetConfig.eagerTravelVirtualList,
      pass: metrics.eagerTravelVirtualList === budgetConfig.eagerTravelVirtualList,
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
      action: "Keep Travel lists below the virtualization threshold on the plain static CSS path.",
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
