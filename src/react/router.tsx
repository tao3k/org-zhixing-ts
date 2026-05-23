import {
  Link,
  Navigate,
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { MouseEventHandler, ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { adjacentBlogArticleSelection } from "../blogNavigation";
import type { AgendaPanelKey } from "../agendaTypes";
import { isAgendaMode, isAgendaPanel } from "../agendaState";
import { renderView } from "../render";
import { travelViewFromStaticSite } from "../travelSiteProjection";
import type { ContentShellData } from "../services/contentServices";
import type { ViewKey } from "../model";
import {
  isEditableTarget,
  lifeFacetFor,
  routePathForView,
  viewDomNodes,
  viewForPath,
} from "./routeViewHelpers";
import { getReactQueryClient } from "./queryClient";

export type OrgZhixingRouterContext = {
  getQueryClient: () => Promise<QueryClient>;
};

const rootRoute = createRootRouteWithContext<OrgZhixingRouterContext>()({
  component: RootLayout,
  loader: ({ context }) => loadContentShellQuery(context),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Navigate replace to="/blogs" />,
});

const blogsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/blogs",
  component: BlogIndexPage,
  validateSearch: (search: Record<string, unknown>) => search,
});

const blogArticleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/blogs/$articleId",
  component: BlogArticlePage,
  loader: ({ context, params }) => loadArticleQuery(context, params.articleId),
  validateSearch: (search: Record<string, unknown>) => search,
});

const galleryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/gallery",
  component: GalleryPage,
});
const notesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes",
  component: NotesPage,
  loader: ({ context }) => loadNotesQuery(context),
});
const travelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/travel",
  component: TravelPage,
});
const memoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/memory",
  component: MemoryPage,
  loader: ({ context }) =>
    loadDocumentQuery(context, "memory", {
      attachmentInventory: true,
      memory: true,
      sectionIndex: true,
    }),
});
const agendaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agenda",
  component: AgendaPage,
  loader: ({ context }) => loadDocumentQuery(context, "agenda", { agenda: true }),
  validateSearch: (search: Record<string, unknown>) => search,
});
const captureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/capture",
  component: CapturePage,
  loader: ({ context }) => loadDocumentQuery(context, "capture", {}),
});
const diagnosticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/diagnostics",
  component: DiagnosticsPage,
  loader: ({ context }) => loadDocumentQuery(context, "diagnostics", {}),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  blogsRoute,
  blogArticleRoute,
  galleryRoute,
  notesRoute,
  travelRoute,
  memoryRoute,
  agendaRoute,
  captureRoute,
  diagnosticsRoute,
]);

export const router = createRouter({
  context: {
    getQueryClient: getReactQueryClient,
  },
  defaultPreload: "intent",
  routeTree,
});

async function loadContentShellQuery(context: OrgZhixingRouterContext): Promise<ContentShellData> {
  const queryClient = await context.getQueryClient();
  return queryClient.ensureQueryData({
    queryKey: ["org-zhixing", "content-shell"],
    queryFn: async () => {
      const { loadContentShellData } = await import("../services/contentServices");
      return loadContentShellData();
    },
  });
}

async function loadArticleQuery(
  context: OrgZhixingRouterContext,
  articleId: string,
): Promise<Awaited<ReturnType<typeof import("../services/contentServices").loadBlogArticleData>>> {
  const shell = await loadContentShellQuery(context);
  const queryClient = await context.getQueryClient();
  return queryClient.ensureQueryData({
    queryKey: ["org-zhixing", shell.staticSite?.generatedAt ?? "dynamic", "article", articleId],
    queryFn: async () => {
      const { loadBlogArticleData } = await import("../services/contentServices");
      return loadBlogArticleData(articleId, shell);
    },
  });
}

async function loadNotesQuery(
  context: OrgZhixingRouterContext,
): Promise<Awaited<ReturnType<typeof import("../services/contentServices").loadSiteNotesData>>> {
  const shell = await loadContentShellQuery(context);
  const queryClient = await context.getQueryClient();
  return queryClient.ensureQueryData({
    queryKey: ["org-zhixing", shell.staticSite?.generatedAt ?? "dynamic", "notes"],
    queryFn: async () => {
      const { loadSiteNotesData } = await import("../services/contentServices");
      return loadSiteNotesData(shell);
    },
  });
}

async function loadDocumentQuery(
  context: OrgZhixingRouterContext,
  view: ViewKey,
  options: Parameters<typeof import("../services/contentServices").loadStaticDocumentData>[1],
): Promise<
  Awaited<ReturnType<typeof import("../services/contentServices").loadStaticDocumentData>>
> {
  const shell = await loadContentShellQuery(context);
  const queryClient = await context.getQueryClient();
  return queryClient.ensureQueryData({
    queryKey: [
      "org-zhixing",
      shell.staticSite?.generatedAt ?? "dynamic",
      "document",
      view,
      shell.initialSource.sourceFile,
    ],
    queryFn: async () => {
      const { loadStaticDocumentData } = await import("../services/contentServices");
      return loadStaticDocumentData(shell, options);
    },
  });
}

function RootLayout(): ReactNode {
  const shell = rootRoute.useLoaderData();
  const location = useLocation();
  const view = viewForPath(location.pathname);
  const readerMode = location.pathname.startsWith("/blogs/") ? "zen" : "library";

  useEffect(() => {
    document.documentElement.lang = shell.siteConfig.locale;
    document.title = shell.siteConfig.title;
    const app = document.querySelector<HTMLElement>("#app");
    if (app) {
      app.dataset.view = view;
      app.dataset.readerMode = readerMode;
    }
  }, [readerMode, shell.siteConfig.locale, shell.siteConfig.title, view]);

  return (
    <main className="shell">
      <header className="site-header">
        <Link className="site-brand" to="/blogs" aria-label="Zhixing home">
          <span>知行合一</span>
          <small>Zhixing</small>
        </Link>
        <nav id="tabs" className="site-nav" aria-label="Life archive navigation">
          {shell.siteConfig.menu.map((item) => (
            <Link
              key={item.view}
              to={routePathForView(item.view)}
              className="site-nav-item"
              activeProps={{ className: "site-nav-item active" }}
            >
              <span>{item.name}</span>
              <small>{lifeFacetFor(item.view)}</small>
            </Link>
          ))}
        </nav>
        <output id="status" className="site-status">
          {shell.staticSite ? "static site-wide" : "live source"}
        </output>
      </header>
      {readerMode === "library" ? (
        <section className="site-hero">
          <div className="hero-copy">
            <p className="eyebrow">Personal digital garden</p>
            <h1 id="site-title">{shell.siteConfig.title}</h1>
            <p>把写作、札记、事件与行动议程放回同一个 Org 源头，让知识进入每天的实践。</p>
          </div>
        </section>
      ) : null}
      <section className="viewer-pane">
        <Outlet />
      </section>
      <div className="runtime-state" aria-hidden="true">
        <strong id="active-source-title">{shell.initialSource.name}</strong>
        <small id="active-source-path">{shell.initialSource.file} / blog source</small>
      </div>
    </main>
  );
}

function BlogIndexPage(): ReactNode {
  const shell = rootRoute.useLoaderData();
  const search = blogsRoute.useSearch() as { tag?: string; time?: string };
  const navigate = useNavigate();
  const html = useMemo(
    () =>
      renderView({
        view: "blog",
        document: null,
        blogIndex: shell.staticSite?.blog ?? null,
        blogTagFilter: search.tag ?? null,
        blogTimeFilter: search.time ?? null,
        blogZenMode: false,
      }),
    [search.tag, search.time, shell.staticSite?.blog],
  );
  useEffect(() => {
    if (!html.includes("data-blog-virtual-list")) {
      return;
    }
    const controller = new AbortController();
    void import("../blogVirtualList").then(({ bindBlogVirtualList }) => {
      if (!controller.signal.aborted) {
        bindBlogVirtualList(viewDomNodes(), controller.signal);
      }
    });
    return () => controller.abort();
  }, [html]);
  const onClick: MouseEventHandler<HTMLDivElement> = (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-blog-article], button[data-blog-tag], button[data-blog-time]",
    );
    if (!target) {
      return;
    }
    event.preventDefault();
    if (target.dataset.blogArticle) {
      void navigate({
        params: { articleId: target.dataset.blogArticle },
        search: target.dataset.blogSource ? { source: target.dataset.blogSource } : {},
        to: "/blogs/$articleId",
      } as never);
      return;
    }
    if (target.dataset.blogTag !== undefined) {
      void navigate({
        search: {
          tag: target.dataset.blogTag || undefined,
          time: search.time,
        },
        to: "/blogs",
      } as never);
      return;
    }
    if (target.dataset.blogTime !== undefined) {
      void navigate({
        search: {
          tag: search.tag,
          time: target.dataset.blogTime || undefined,
        },
        to: "/blogs",
      } as never);
    }
  };
  return <HtmlSurface html={html} onClick={onClick} />;
}

function BlogArticlePage(): ReactNode {
  const shell = rootRoute.useLoaderData();
  const article = blogArticleRoute.useLoaderData();
  const navigate = useNavigate();
  const html = renderView({
    view: "blog",
    document: article.document,
    articleHtml: article.html,
    blogArticleRangeStart: article.article.rangeStart,
    blogIndex: shell.staticSite?.blog,
    blogZenMode: true,
    sourceFile: article.source.sourceFile,
  });

  useEffect(() => {
    const controller = new AbortController();
    void import("../blogZenProgress").then(({ bindBlogZenProgress }) => {
      if (!controller.signal.aborted) {
        bindBlogZenProgress(viewDomNodes(), controller.signal);
      }
    });
    return () => controller.abort();
  }, [html]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        void navigate({ to: "/blogs" });
        return;
      }
      const direction =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? -1
            : 0;
      if (!direction) {
        return;
      }
      const selection = adjacentBlogArticleSelection({
        currentRangeStart: article.article.rangeStart,
        currentSourceFile: article.source.sourceFile,
        direction,
        document: article.document,
        staticBlogIndex: shell.staticSite?.blog,
      });
      if (!selection) {
        return;
      }
      event.preventDefault();
      void navigate({
        params: { articleId: String(selection.rangeStart) },
        search: selection.sourceFile ? { source: selection.sourceFile } : {},
        to: "/blogs/$articleId",
      } as never);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [article, navigate, shell.staticSite?.blog]);

  return <HtmlSurface html={html} />;
}

function GalleryPage(): ReactNode {
  const shell = rootRoute.useLoaderData();
  return (
    <HtmlSurface
      html={renderView({
        view: "gallery",
        document: null,
        attachmentGallery: shell.staticSite?.attachmentGallery ?? null,
      })}
    />
  );
}

function TravelPage(): ReactNode {
  const shell = rootRoute.useLoaderData();
  const html = renderView({
    view: "travel",
    document: null,
    travelView: shell.staticSite ? travelViewFromStaticSite(shell.staticSite) : undefined,
  });
  useEffect(() => {
    const controller = new AbortController();
    void import("../travelGlance").then(({ bindTravelGlance, prefetchTravelGlanceRuntime }) => {
      if (!controller.signal.aborted) {
        bindTravelGlance(viewDomNodes(), controller.signal);
        prefetchTravelGlanceRuntime();
      }
    });
    if (html.includes("data-travel-virtual-list")) {
      void import("../travelVirtualList").then(({ bindTravelVirtualList }) => {
        if (!controller.signal.aborted) {
          bindTravelVirtualList(viewDomNodes(), controller.signal);
        }
      });
    }
    return () => controller.abort();
  }, [html]);
  return <HtmlSurface html={html} />;
}

function NotesPage(): ReactNode {
  const notes = notesRoute.useLoaderData();
  return <HtmlSurface html={renderView({ view: "records", document: null, siteNotes: notes })} />;
}

function MemoryPage(): ReactNode {
  const data = memoryRoute.useLoaderData();
  return (
    <HtmlSurface
      html={renderView({
        view: "memory",
        document: data.document,
        articleHtml: data.html,
        sourceFile: data.source.sourceFile,
      })}
    />
  );
}

function AgendaPage(): ReactNode {
  const data = agendaRoute.useLoaderData();
  const search = agendaRoute.useSearch() as {
    agenda?: string;
    panel?: string;
    rule?: string;
  };
  const shell = rootRoute.useLoaderData();
  const agendaMode = isAgendaMode(search.agenda) ? search.agenda : shell.siteConfig.agenda.mode;
  const agendaPanel: AgendaPanelKey = isAgendaPanel(search.panel) ? search.panel : "trace";
  return (
    <HtmlSurface
      html={renderView({
        view: "agenda",
        document: data.document,
        agendaMode,
        agendaPanel,
        agendaRuleId: search.rule ?? null,
      })}
    />
  );
}

function CapturePage(): ReactNode {
  const data = captureRoute.useLoaderData();
  return <HtmlSurface html={renderView({ view: "capture", document: data.document })} />;
}

function DiagnosticsPage(): ReactNode {
  const data = diagnosticsRoute.useLoaderData();
  return <HtmlSurface html={renderView({ view: "diagnostics", document: data.document })} />;
}

function HtmlSurface({
  html,
  onClick,
}: {
  html: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
}): ReactNode {
  return <div id="view" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
