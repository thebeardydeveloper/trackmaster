# design-sync notes — TrackMaster

TrackMaster is a Next.js game, not a component library. Only the presentational pieces in `src/ui/` are synced (user chose a "limited scope" on 2026-11-20). The 3D scene, the node editor, the Timeline, SetupPanel and CornerTable are out of scope because they depend on the store and the simulation.

## How the build works here
- **No dist.** The entry is `src/ui/index.ts` (cfg.entry). The converter finds no `.d.ts` exports, so the components are listed in `componentSrcMap`, and their props are hand-written in `dtsPropsFor`. **When a prop changes in `src/ui/<Name>.tsx`, update `dtsPropsFor.<Name>` too** (nothing checks this automatically).
- **CSS:** Tailwind 4 compiled stand-alone from `.design-sync/tailwind.css` (`@source ../src` + `./previews`) into `.design-sync/.cache/tailwind.out.css`. Run `cfg.buildCmd` before every build, otherwise new classes are missing. `@tailwindcss/cli@4.3.3` is installed in `.ds-sync/` (keep it on the same version as the repo's `tailwindcss`).
- **Fonts:** the app uses next/font (Geist and Geist Mono). For the sync, the OFL variable woff2 files (from the `geist` npm package) are committed in `.design-sync/fonts/` and wired through `extraFonts`.
- **Groups:** `docsMap` points at the stubs `.design-sync/docs/{timing,track}.md` (category only).
- **Playwright:** the cached chromium is build 1248, so use `playwright@1.64.1` in `.ds-sync/` (1.65.x wants 1255).

## Previews
- The card harness forces `body{background:#fff}` and every component is white-on-dark, so each preview wraps its stories in a local `Dark` wrapper (`bg-[#0b0f14]`).
- DeltaStat, SectorChip, MiniMap and WeatherBadge use `cardMode: column`, because their stories are wider than the grid cell.
- MiniMap previews build their outlines inline. A built `Track` isn't needed: `MiniMapShape` is a structural subset.

## Known render warns
- (none outstanding)

## Re-sync risks
- `dtsPropsFor` duplicates the props in `src/ui/*.tsx` and goes stale silently if a component's API changes.
- The compiled CSS only contains classes the game uses. If the conventions header names a class that the game stops using, it disappears from the stylesheet, so re-run the conventions validation on every sync.
- `tailwind.out.css` is gitignored machine output: a fresh clone must run `cfg.buildCmd` first.
- Fonts are a copy of `geist` from npm, not the exact next/font files; they could drift visually if the app changes font.
