# TrackMaster UI — conventions for building screens

TrackMaster is a racing-strategy game: the player programs timed orders (accelerate, brake, steer) and watches a single-seater run them on an isometric 3D circuit. The UI is **dark-only**, compact, and timing-screen flavoured. All copy is **Spanish (rioplatense: "frená", "largá", "tu mejor")**.

## Setup — the dark root is mandatory

There is no provider. Components read nothing from context — just load `styles.css`. But every component is white-on-dark: on a white page they are invisible. Always put screens on the app background:

```jsx
<div className="min-h-dvh bg-[#0b0f14] font-sans text-zinc-100">…</div>
```

Fonts: `font-sans` = Geist, `font-mono` = Geist Mono (both shipped in `fonts/`). Every number that ticks — lap times, deltas, km/h — uses `font-mono tabular-nums`.

## Styling idiom — Tailwind utilities, precompiled

Style with Tailwind 4 utility classes. **The stylesheet is precompiled from the game's source, so only classes the game already uses exist.** Stick to this vocabulary, and read `_ds_bundle.css` before using anything else:

| Role | Classes |
|---|---|
| Page / panels | `bg-[#0b0f14]`, `bg-[#0e1319]`, cards `bg-white/[0.03] border border-white/10 rounded-xl`, wells `bg-white/5 rounded-lg`, overlays `bg-black/40`…`bg-black/80` |
| Text levels | `text-white` (titles), `text-white/90`, `text-white/70`, `text-white/50` (secondary), `text-white/45` (labels), `text-white/15` (disabled) |
| Labels | `text-[10px]` or `text-[11px] font-semibold uppercase tracking-widest text-white/50` |
| Primary action | `rounded-lg bg-amber-400 px-4 py-2 font-semibold text-black` |
| Secondary action | `rounded-md border border-white/15 px-2.5 py-1 text-white/80 hover:border-white/40 hover:text-white` |
| Selected option | `border-amber-400/80 bg-amber-400/10` |
| Accent / record | `text-amber-300` |
| Faster / slower | `text-emerald-300` / `text-red-300` |
| Wind, info | `text-sky-300` |
| Hint boxes | `border border-{emerald,amber,red,sky}-400/40 bg-{same}-400/10` + `text-{same}-100` |
| Sector colours | purple `bg-fuchsia-600`, green `bg-emerald-500`, yellow `bg-amber-300` — use `SectorChip`, don't hand-roll them |

Radii: `rounded-md` (buttons, pills), `rounded-lg` (wells, tiles), `rounded-xl` (cards). Text sizes: `text-xs` for dense panels, `text-sm` for body.

## Components (window.TrackMaster.*)

- **Timing**: `Stat` (label/value pair for headers), `DeltaStat` (± seconds tile, green/red), `SectorChip` (purple/green/yellow split), `Stars` (0–3 rating for training levels).
- **Track**: `MiniMap` (circuit outline in `currentColor`; size and colour come from `className`), `WeatherBadge` (rain/dry + wind pill), `WindArrow` (rotated ↑).

`conditions` = `{ rain, windKmh, windToDeg }`. `windToDeg` is where the wind blows **towards**, in degrees counter-clockwise from east. Use `view="map"` on north-up maps and `"iso"` over the race view. Each component's props and examples are in `components/<group>/<Name>/<Name>.prompt.md` and `.d.ts`.

Format times as `m:ss.mmm` (`1:10.185`), sectors as `ss.mmm`, and deltas with a sign (`-0.412`, `+2.873`).

## Example — result card

```jsx
const { Stat, DeltaStat, SectorChip } = window.TrackMaster;

<div className="min-h-dvh bg-[#0b0f14] p-6 font-sans text-zinc-100">
  <div className="w-96 rounded-xl border border-white/10 bg-white/[0.03] p-4">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-white/50">Intento 2 de 3</span>
      <Stat label="Tu mejor" value="1:14.902" accent />
    </div>
    <div className="mt-3 flex gap-2">
      <SectorChip index={0} time={21.347} color="purple" />
      <SectorChip index={1} time={24.902} color="green" />
      <SectorChip index={2} time={26.118} color="yellow" />
    </div>
    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
      <DeltaStat label="vs. tu mejor" d={-0.412} />
      <DeltaStat label="vs. récord" d={2.873} />
      <DeltaStat label="vs. promedio" d={null} />
    </div>
    <button className="mt-4 w-full rounded-lg bg-amber-400 px-4 py-2 font-semibold text-black">Largar</button>
  </div>
</div>
```
