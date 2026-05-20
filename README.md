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
npm dependency and owns the TypeScript/Rspack browser shell. `npm run dev` runs
`rspack serve` with file watching for Org sources, TOML configuration, and the
WASM package artifacts, so frontend changes compile without restarting
`just dev`.

## Host Boundary

The long-term product host can still be TanStack Start or another application
shell. This demo keeps the parser-facing UI host small and explicit: Rspack owns
the local compiler/watch surface, and the app module owns rendering and
interaction state.

The reusable browser layer is `mountOrgZhixingApp(root, { createWorker })`.
`src/workerFactory.ts` creates the browser worker through Rspack's native
`new Worker(new URL(..., import.meta.url))` path. The parser client, TOML
config, source loading, view model, and renderer stay host-agnostic so a larger
product route can mount the same app with its own worker factory.

## Configuration

User-facing configuration is TOML, but it is intentionally smaller and cleaner
than Hugo's full site configuration model:

```toml
[site]
title = "Org Zhixing"
locale = "zh-CN"

[content]
root = "blog"
default_source = "demo"

[[content.sources]]
id = "demo"
title = "Org Zhixing Demo"
file = "org-zhixing-demo.org"

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
Config files must be root-level public TOML files, and content sources stay
under `public/blog/*.org`.

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

`npm run build` runs `npm run generate:static` before Rspack. That generator
uses the Rust/WASM package to precompute `viewIndex`, `sectionIndex`, rendered
HTML, attachment inventory, memory, agenda, and lint for every configured Org
source, then ships the result as `org-zhixing.static.json` in `dist/`.

At runtime the app first looks for that static manifest. GitHub Pages therefore
hydrates Blog, Gallery, Notes, Memory, and Agenda from immutable static data
instead of waiting for a chain of browser-side WASM projections. If the manifest
is absent, such as in local watch mode, the app falls back to the worker path.
The status line reports `static` timing for precomputed data and
`parse/agenda/capture/lint/html` timings for dynamic projections. Run
`just perf` for the local WASM microbenchmark, and see `docs/performance.md` for
the current bottleneck map and next milestones.
