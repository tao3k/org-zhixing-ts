# Style Modules

`../styles.css` is the ordered entry manifest. Keep it import-only so the cascade
stays explicit and reviewable.

- `theme.css`: Radix Colors and Fontsource imports plus the app semantic face tokens.
- `foundation.css`: app shell, navigation, source picker, and shared page frame.
- `blog.css` and `blog-rendered.css`: blog reader layout and article overrides.
- `attachments.css`: attachment gallery and media thumbnails.
- `travel.css`: Travel cards, Zen Glance, maps, and travel responsive contracts.
- `records-memory.css`: record projection and memory surfaces.
- `agenda-*.css`: Agenda list, cockpit, program, and their responsive contracts.
- `rendered-org.css`: generic Org HTML projection styling shared by views.
- `responsive.css`: final cross-view mobile overrides.

If a module grows past the line-count guard in `tests/style-modules.test.ts`,
split it by product surface before adding new selectors.
