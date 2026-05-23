# Org Zhixing

Org Zhixing is a small browser demo that displays user-facing Org content
through the `orgize` WebAssembly worker. It does not parse Org in TypeScript;
Rust remains the parser and semantic projection owner.

The demo is configured by `public/org-zhixing.toml`. TypeScript does not parse
the Org syntax itself. Production builds pre-generate a static Org projection
manifest from the Rust/WASM package, and development falls back to the worker
when that manifest is not present. The visible surface uses Rust-rendered HTML
as the main article column, with structured side views:

- Blog: headline records tagged `blog`.
- Records: ordinary user records, properties, links, and attachment evidence.
- Travel: Org travel headings projected into place cards with Google Maps URLs,
  coordinate evidence, source links, and Agent enrichment fields.
- Agenda: a modern, explainable planning workspace built from the Rust-owned
  `agendaView` projection. TypeScript groups parser-produced cards by attention
  signals such as blockers, timed focus, deadlines, waiting state, and completion
  history without re-parsing Org syntax.
- Capture: an Agent-facing intake preview backed by the Rust/WASM
  `capturePlan` projection. TypeScript only prepares the interaction request and
  renders the returned native Org entry, review-only patch preview, receipts,
  warnings, target, and memory policy. The returned application contract lists
  runtime preconditions such as confirmation and host-owned git write-lock
  acquisition; orgize still does not mutate source files.

## Local Development

From this repository inside the `orgize` checkout:

```sh
cd ../..
direnv exec . just wasm-build
cd .data/org-zhixing
npm install
direnv exec . just dev
```

The parent `orgize` checkout owns the Rust/WASM toolchain and builds
`wasm/dist/orgize.js` plus `wasm/dist/orgize_bg.wasm` through its root Justfile.
`org-zhixing` consumes the published `orgize-wasm` package through the `orgize`
npm dependency and owns the Rsbuild + React browser shell. `npm run dev` runs
`rsbuild dev` with file watching for Org sources, TOML configuration, generated
static shards, and the WASM package artifacts, so frontend changes compile
without restarting `just dev`.

## Host Boundary

The product host is now a static-first React app on Rsbuild. TanStack Router
owns path-first navigation, TanStack Query owns generated manifest/shard
caching, and Effect owns the typed async service layer that loads Org
projections.

`src/workerFactory.ts` creates the browser worker through the bundler-native
`new Worker(new URL(..., import.meta.url))` path. Static routes consume
pre-generated DTOs first; the parser worker remains available for live source
projection when a route or future editor asks for it.

## Documentation

Durable design notes are Org-first and indexed from `docs/index.org`. The
content loading contract lives in
`docs/10_architecture/10.01_content_directory_contract.org`, and the Agent
Travel projection contract lives in
`docs/10_architecture/10.02_agent_travel_projection.org`.

## Configuration

User-facing configuration is TOML, but it is intentionally smaller and cleaner
than Hugo's full site configuration model:

```toml
[site]
title = "Org Zhixing"
locale = "zh-CN"

[content]
content_dir = "blog"

[ui]
default_view = "agenda"
show_timings = true

[[ui.views]]
id = "blog"
label = "Blog"
weight = 10

[[ui.views]]
id = "capture"
label = "Capture"
weight = 35

[behavior]
lazy_lint = true

[agenda]
start = "2026-05-15"
days = 7
limit = 32
mode = "classic"
```

The browser accepts `?config=other.toml`, `?source=note.org`,
`?view=agenda`, `?view=capture`, `?agenda=strict`, `?agenda=auto`,
`?agenda=agent`, and `?perf=0` overrides.
Config files must be root-level public TOML files. The `[content] content_dir`
is the entry directory, and the static generator discovers `*.org` files under
that root in the same spirit as Hugo content traversal. Legacy
`[[content.sources]]` tables are still parsed for older fixtures, but new
configs should let Org files own titles, tags, and semantic metadata.

## Capture Runtime Projection

The Capture tab demonstrates the modern Agent Capture boundary without becoming
the write runtime. It calls the WASM `capturePlan` DTO, reads the plan's
`application` contract, and derives a review-only patch projection for the
active configured source. The projection uses the repo-relative content source
from `org-zhixing.toml`; it does not expose or require a local absolute path.

Applying the capture remains host-owned. A product runtime must confirm the
intent with the user, acquire the git write lock, resolve datetree or outline
targets, and then perform the write path. The browser demo only shows what that
runtime would apply.

## Harness

`typescript-lang-project-harness` is pinned as a GitHub dev dependency and runs
through:

```sh
npm run harness
just harness
```

`just check` includes typecheck, the TypeScript harness, and the production
frontend build. Run `direnv exec . just wasm-build` from the parent `orgize`
checkout when the Rust WASM package needs rebuilding.

## Performance Shape

`npm run build` runs `npm run generate:static` before Rsbuild. That generator
uses the Rust/WASM package to precompute `viewIndex`, `sectionIndex`, rendered
HTML, attachment inventory, memory, agenda, and lint for every discovered Org
source.  The build ships a compact `org-zhixing.static.json` entry manifest plus
per-source JSON shards under `org-zhixing.sources/`, lazy agenda shards under
`org-zhixing.agenda/`, lazy attachment shards under `org-zhixing.attachments/`,
lazy Agent memory shards under `org-zhixing.memory/`, and lazy semantic section
shards under `org-zhixing.sections/`.

At runtime the app first looks for that static manifest. GitHub Pages therefore
hydrates source navigation, site-wide Gallery, and Travel from immutable compact
static data. Source-scoped views and the site-wide Notes view load source
shards on demand instead of parsing one large manifest up front. Agenda,
Gallery/attachment rewriting, Memory, Notes, and Zen article rendering load
their dedicated shards only when the active view needs that projection. If the
manifest is absent, such as in local watch mode, the app falls back to the
worker path.
The status line reports `static` timing for precomputed data and
`parse/agenda/capture/lint/html` timings for dynamic projections. Run
`just perf` for the WASM and UI performance gates. The durable reports live in
`docs/90_operations/performance-reports/`, and
`docs/90_operations/90.01_performance_notes.org` tracks the current bottleneck
map and next milestones.
