import {
  articleDateIsoForIndex,
  articleDateLabel,
  articleDateRankForIndex,
  blogTagFacets,
  blogTimelineArticles,
} from "./blogArticleTimeline";
import { rewriteAttachmentLinks } from "./attachmentHtmlRewrite";
import { applyHtmlEmbedPolicy } from "./htmlEmbedPolicy";
import type { BlogArticleRecord, OrgizeDocumentView } from "./model";
import {
  augmentOrgHtmlMetadata,
  matchHeadingRecord,
  normalizeDisplayText,
  sectionRecords,
  sectionTitle,
  type SectionRecord,
} from "./orgHtmlMetadata";
import { enhanceOrgNativeAesthetics } from "./orgNativeAesthetics";
import type { StaticBlogArticle, StaticBlogIndex } from "./staticSiteData";

type PreparedArticle = {
  html: string;
};

type BlogIndexArticle = Pick<
  BlogArticleRecord,
  "bodyPreview" | "effectiveTags" | "planning" | "properties" | "rangeStart" | "title"
> &
  Partial<Pick<StaticBlogArticle, "sourceFile" | "sourceName">>;

type BlogIndexView = {
  articleCount: number;
  articles: BlogIndexArticle[];
  dateRange: { end: string; start: string } | null;
  sourceCount: number;
  tagFacets: Array<{ count: number; tag: string }>;
};

type BlogTimeBucket = {
  count: number;
  endIso: string;
  endRank: number;
  id: string;
  label: string;
  startIso: string;
  startRank: number;
};

type ReasoningPath = {
  branchTags: string[];
  count: number;
  rootTag: string;
};

export type BlogReaderRenderOptions = {
  articleHtml: string;
  articleMessage: string;
  blogIndex: StaticBlogIndex | null | undefined;
  document: OrgizeDocumentView | null;
  selectedRangeStart: number | null;
  sourceFile: string | undefined;
  tagFilter: string | null;
  timeFilter: string | null;
  zenMode: boolean;
};

const maxTimeBuckets = 12;
export const blogVirtualListThreshold = 120;

export const renderBlogReader = ({
  articleHtml,
  articleMessage,
  blogIndex,
  document,
  sourceFile,
  tagFilter,
  timeFilter,
  zenMode,
}: BlogReaderRenderOptions): string => {
  const articles = document ? blogTimelineArticles(document) : [];
  if (!zenMode) {
    return renderBlogIndex(blogIndex ?? blogIndexFromDocument(articles), tagFilter, timeFilter);
  }
  if (!document) {
    return `<div class="empty blog-article-empty">${escapeHtml(articleMessage || "Loading Org source...")}</div>`;
  }
  const selectedArticle = prepareRenderedArticle(articleHtml, document, sourceFile);
  const emptyMessage =
    articleMessage ||
    (articles.length === 0 ? "No Org file article found in this source." : "Rendering article...");

  return `
    <section class="blog-reader is-zen" aria-label="Blog reader">
      <div class="blog-zen-progress" data-blog-zen-progress aria-hidden="true">
        <span></span>
      </div>
      ${
        selectedArticle.html
          ? `<article class="rendered-html blog-article">${selectedArticle.html}</article>`
          : `<div class="empty blog-article-empty">${escapeHtml(emptyMessage)}</div>`
      }
      ${selectedArticle.html ? `<footer class="blog-zen-end" aria-hidden="true"><span></span><b>End</b><span></span></footer>` : ""}
    </section>
  `;
};

const renderBlogIndex = (
  index: BlogIndexView,
  tagFilter: string | null,
  timeFilter: string | null,
): string => {
  const timeBuckets = blogTimeBuckets(index.articles);
  const activeTimeBucket = timeBuckets.find((bucket) => bucket.id === timeFilter) ?? null;
  const normalizedTag = tagFilter?.toLowerCase() ?? null;
  const filteredArticles = filterBlogArticles(index.articles, normalizedTag, activeTimeBucket);
  const reasoningFacets = index.tagFacets.filter((facet) =>
    filteredArticles.some((article) =>
      article.effectiveTags.some((tag) => tag.toLowerCase() === facet.tag.toLowerCase()),
    ),
  );
  const reasoningPaths = blogReasoningPaths(filteredArticles, reasoningFacets);
  return `
    <section class="blog-index" aria-label="Blog index">
      <header class="blog-index-topline">
        <p class="eyebrow">Blog Index</p>
        <p>${escapeHtml(blogIndexSummary(index, filteredArticles.length))}</p>
      </header>
      <div class="blog-index-filterbar">
        ${renderBlogTimeThresholds(timeBuckets, activeTimeBucket)}
        ${renderBlogFacetStrip(index.tagFacets, normalizedTag, index.articleCount)}
      </div>
      ${renderBlogReasoningPaths(reasoningPaths, normalizedTag)}
      ${renderBlogArticleList(filteredArticles)}
    </section>
  `;
};

const renderBlogArticleList = (articles: BlogIndexArticle[]): string =>
  articles.length > 0
    ? `<div class="blog-index-list" role="list"${articles.length >= blogVirtualListThreshold ? " data-blog-virtual-list" : ""}>${articles.map(renderBlogIndexArticle).join("")}</div>`
    : `<div class="empty">No Org articles match this index.</div>`;

const renderBlogIndexArticle = (article: BlogIndexArticle): string => `
  <article role="listitem">
    <button
      type="button"
      class="blog-index-article"
      data-blog-article="${article.rangeStart}"
      ${article.sourceFile ? `data-blog-source="${escapeHtml(article.sourceFile)}"` : ""}
    >
      <span class="blog-index-meta">
        <span>${escapeHtml(articleDateLabel(article))}</span>
        <span>${escapeHtml(article.sourceName ?? "Current Org")}</span>
      </span>
      <strong>${escapeHtml(article.title)}</strong>
      ${renderIndexTags(article.effectiveTags)}
      ${article.bodyPreview ? `<p>${escapeHtml(article.bodyPreview)}</p>` : ""}
    </button>
  </article>
`;

const renderBlogTimeThresholds = (
  buckets: BlogTimeBucket[],
  activeBucket: BlogTimeBucket | null,
): string =>
  buckets.length > 0
    ? `
      <nav class="blog-time-thresholds" aria-label="Blog time thresholds">
        <button type="button" class="blog-time-threshold" data-blog-time="" data-active="${activeBucket === null}">
          <span>All</span><small>${buckets.reduce((sum, bucket) => sum + bucket.count, 0)}</small>
        </button>
        ${buckets.map((bucket) => renderBlogTimeThreshold(bucket, activeBucket)).join("")}
      </nav>
    `
    : "";

const renderBlogTimeThreshold = (
  bucket: BlogTimeBucket,
  activeBucket: BlogTimeBucket | null,
): string => `
  <button
    type="button"
    class="blog-time-threshold"
    data-blog-time="${escapeHtml(bucket.id)}"
    data-active="${activeBucket?.id === bucket.id}"
  >
    <span>${escapeHtml(bucket.label)}</span><small>${bucket.count}</small>
  </button>
`;

const renderBlogFacetStrip = (
  facets: BlogIndexView["tagFacets"],
  activeTag: string | null,
  articleCount: number,
): string =>
  facets.length > 0
    ? `
      <section class="blog-tag-facets" aria-label="Blog tags">
        <button type="button" class="blog-tag-filter" data-blog-tag="" data-active="${activeTag === null}">
          <b>All tags</b><small>${articleCount}</small>
        </button>
        ${facets.map((facet) => renderBlogFacet(facet, activeTag)).join("")}
      </section>
    `
    : "";

const renderBlogFacet = (
  facet: { count: number; tag: string },
  activeTag: string | null,
): string => `
  <button
    type="button"
    class="blog-tag-filter"
    data-blog-tag="${escapeHtml(facet.tag)}"
    data-active="${facet.tag.toLowerCase() === activeTag}"
  >
    <b>${escapeHtml(facet.tag)}</b><small>${facet.count}</small>
  </button>
`;

const renderBlogReasoningPaths = (paths: ReasoningPath[], activeTag: string | null): string =>
  paths.length > 0
    ? `
      <section class="blog-reasoning-paths" aria-label="Blog association paths">
        ${paths.map((path) => renderBlogReasoningPath(path, activeTag)).join("")}
      </section>
    `
    : "";

const renderBlogReasoningPath = (path: ReasoningPath, activeTag: string | null): string => `
  <button
    type="button"
    class="blog-reasoning-path"
    data-blog-tag="${escapeHtml(path.rootTag)}"
    data-active="${path.rootTag.toLowerCase() === activeTag}"
  >
    <span>${escapeHtml(path.rootTag)}</span>
    <small>${escapeHtml(path.branchTags.join(" / "))}</small>
    <b>${path.count}</b>
  </button>
`;

const renderIndexTags = (tags: string[]): string => {
  const visible = tags.filter((tag) => tag.toLowerCase() !== "blog").slice(0, 4);
  return visible.length > 0
    ? `<span class="blog-index-tags">${visible.map((tag) => `<em>${escapeHtml(tag)}</em>`).join("")}</span>`
    : "";
};

const blogIndexFromDocument = (articles: BlogArticleRecord[]): BlogIndexView => ({
  articleCount: articles.length,
  articles,
  dateRange: dateRangeForArticles(articles),
  sourceCount: 1,
  tagFacets: blogTagFacets(articles),
});

const blogIndexSummary = (index: BlogIndexView, visibleCount: number): string => {
  const dateText = index.dateRange ? ` · ${index.dateRange.start} -> ${index.dateRange.end}` : "";
  const visibleText = visibleCount === index.articleCount ? "" : ` · ${visibleCount} visible`;
  return `${index.articleCount} Org files · ${index.tagFacets.length} tag facets${dateText}${visibleText}`;
};

const dateRangeForArticles = (articles: BlogIndexArticle[]): BlogIndexView["dateRange"] => {
  const labels = articles.map(articleDateLabel).filter((label) => label !== "Article");
  return labels.length > 0 ? { end: labels[0], start: labels.at(-1) ?? labels[0] } : null;
};

const filterBlogArticles = (
  articles: BlogIndexArticle[],
  activeTag: string | null,
  activeBucket: BlogTimeBucket | null,
): BlogIndexArticle[] =>
  articles.filter((article) => {
    if (activeTag && !article.effectiveTags.some((tag) => tag.toLowerCase() === activeTag)) {
      return false;
    }
    if (!activeBucket) {
      return true;
    }
    const rank = articleDateRankForIndex(article);
    return rank !== null && rank >= activeBucket.startRank && rank <= activeBucket.endRank;
  });

const blogTimeBuckets = (articles: BlogIndexArticle[]): BlogTimeBucket[] => {
  const dated = articles
    .map((article) => ({
      iso: articleDateIsoForIndex(article),
      rank: articleDateRankForIndex(article),
    }))
    .filter(
      (item): item is { iso: string; rank: number } => item.iso !== null && item.rank !== null,
    )
    .sort((left, right) => right.rank - left.rank);
  if (dated.length === 0) {
    return [];
  }
  const dailyBuckets = blogDailyBuckets(dated);
  if (dailyBuckets.length <= maxTimeBuckets) {
    return dailyBuckets;
  }
  const chunkSize = Math.ceil(dated.length / maxTimeBuckets);
  const buckets: BlogTimeBucket[] = [];
  for (let index = 0; index < dated.length; index += chunkSize) {
    const chunk = dated.slice(index, index + chunkSize);
    const newest = chunk[0];
    const oldest = chunk.at(-1) ?? newest;
    buckets.push({
      count: chunk.length,
      endIso: newest.iso,
      endRank: newest.rank,
      id: `${oldest.iso}..${newest.iso}`,
      label: timeBucketLabel(oldest.iso, newest.iso),
      startIso: oldest.iso,
      startRank: oldest.rank,
    });
  }
  return buckets;
};

const blogDailyBuckets = (dated: Array<{ iso: string; rank: number }>): BlogTimeBucket[] => {
  const grouped = new Map<string, { count: number; endRank: number; startRank: number }>();
  for (const item of dated) {
    const bucket = grouped.get(item.iso);
    if (bucket) {
      bucket.count += 1;
      bucket.startRank = Math.min(bucket.startRank, item.rank);
      bucket.endRank = Math.max(bucket.endRank, item.rank);
    } else {
      grouped.set(item.iso, { count: 1, endRank: item.rank, startRank: item.rank });
    }
  }
  return [...grouped.entries()].map(([iso, bucket]) => ({
    count: bucket.count,
    endIso: iso,
    endRank: bucket.endRank,
    id: iso,
    label: iso,
    startIso: iso,
    startRank: bucket.startRank,
  }));
};

const timeBucketLabel = (startIso: string, endIso: string): string =>
  startIso === endIso ? startIso : `${startIso} - ${endIso}`;

const blogReasoningPaths = (
  articles: BlogIndexArticle[],
  facets: BlogIndexView["tagFacets"],
): ReasoningPath[] =>
  facets
    .slice(0, 8)
    .map((facet) => {
      const matching = articles.filter((article) =>
        article.effectiveTags.some((tag) => tag.toLowerCase() === facet.tag.toLowerCase()),
      );
      return {
        branchTags: relatedTagsFor(matching, facet.tag),
        count: matching.length,
        rootTag: facet.tag,
      };
    })
    .filter((path) => path.branchTags.length > 0);

const relatedTagsFor = (articles: BlogIndexArticle[], rootTag: string): string[] => {
  const root = rootTag.toLowerCase();
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const tag of article.effectiveTags) {
      const normalized = tag.toLowerCase();
      if (normalized === "blog" || normalized === root) {
        continue;
      }
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([tag]) => tag);
};

const prepareRenderedArticle = (
  articleHtml: string,
  document: OrgizeDocumentView,
  sourceFile: string | undefined,
): PreparedArticle => {
  return prepareArticleHtml(articleHtml, document, sourceFile);
};

const prepareArticleHtml = (
  html: string,
  document: OrgizeDocumentView,
  sourceFile: string | undefined,
): PreparedArticle => {
  if (!html) {
    return { html: "" };
  }
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");
  const body = parsed.body;
  const headings = [...body.querySelectorAll<HTMLHeadingElement>("h1,h2,h3,h4,h5,h6")];
  const usedIds = new Set<string>();
  const records = sectionRecords(document);
  const usedRecords = new Set<SectionRecord>();

  for (const heading of headings) {
    const record = matchHeadingRecord(heading, records, usedRecords);
    if (record) {
      usedRecords.add(record);
    }
    const title = tocHeadingTitle(heading, record);
    if (title) {
      heading.id = uniqueHeadingId(title, usedIds);
    }
  }
  rewriteAttachmentLinks(body, document, sourceFile);
  applyHtmlEmbedPolicy(body);
  augmentOrgHtmlMetadata(body, document);
  enhanceOrgNativeAesthetics(body, document);
  return { html: body.innerHTML };
};

const tocHeadingTitle = (heading: HTMLHeadingElement, record: SectionRecord | null): string =>
  normalizeDisplayText(
    record ? sectionTitle(record) : stripOrgHeadingTags(heading.textContent ?? ""),
  );

const stripOrgHeadingTags = (value: string): string =>
  value.replace(/\s+(:[A-Za-z0-9_@#%]+)+:\s*$/, "");

const uniqueHeadingId = (title: string, usedIds: Set<string>): string => {
  const base = slugify(title) || "section";
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix++}`;
  }
  usedIds.add(candidate);
  return candidate;
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");

const escapeHtml = (value: string | number): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
