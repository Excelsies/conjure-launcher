# Noctalia launcher: reference behaviour

Extracted from noctalia-dev/noctalia at commit `60861c9` (2026-11-04), MIT. Paths are upstream paths.
Upstream launcher code totals about 6.5k lines of C++ (`src/launcher/*.cpp` plus
`src/shell/launcher/launcher_panel.cpp`).

## Provider model (`src/launcher/launcher_provider.h`)
- A result has: `id`, `providerId`, `title`, `subtitle`, `iconName`/`iconPath`/`glyphName`, `badge`
  (an emoji or symbol drawn in place of the icon), `desktopActionId`, `category`, `query` (choosing
  the result rewrites the input, for drill-in), `score`, `recentlyUsedIndex`, `pinned`.
- A provider has: `id` (stable, used as the usage key), `prefix`, `includeInGlobalSearch`,
  `trackUsage`, `supportsGrid`, `categories`, `query(text)`, `activate(result)`, and an async
  results-changed callback.

## Query routing (`launcher_panel.cpp` `onInputChanged`)
1. A scoped provider (dmenu mode) handles the query alone.
2. Otherwise the longest matching prefix wins. Prefixes are `provider_prefix` (default `/`) plus a
   trigger word: `/calc`, `/emo`, `/win`, `/session`, `/wall`, `/pan`.
3. A bare `/` lists the providers. Choosing one inserts its prefix.
4. Otherwise it runs a global search: providers with no prefix (apps), plus opt-in global providers
   once the query is at least 2 characters long. The calculator is global, but only when the query
   contains a digit.
5. Results are merged and stable-sorted by raw score. Scores are not normalised: math is always
   10000 and an app name match gets +3000.
6. The view filter then applies: All / Pinned / Recent / a category.

## Scoring
- fzy (`third_party/fzy`, MIT): about 340 lines of C, which ports directly to JS. An exact match
  scores 1024 and no match scores -inf.
- App weights (`app_provider.cpp:28-75`):
  - name fzy x5, +500 if the name starts with the query, +3000 for any name match;
  - localized name +1500;
  - otherwise the maximum of: generic name x2, keywords x0.8, categories x0.3, id x1.5, exec x1.
  - Top 50 results.
- Usage boost (`launcher_panel.cpp:59-76`): count x 0.1, capped at 0.5 when a query is typed, with no
  time decay. Recent list: the last 20 ids per provider.
- Storage: `~/.local/state/noctalia/{usage_counts,recently_used}.json`. Apps are keyed by .desktop
  path; we key by app id instead.

## UI (Full layout)
- Size 760x620; width is configurable from 560 to 1100. Panel radius 12, padding 8, gap 8.
- Nav row (a segmented control): Recent / Pinned / All / Categories / Providers. The `default_view`
  tab comes first. Labels collapse to icons below 680px wide.
- Chip row: categories or provider categories.
- Results list. Each row: 40px icon, then title (14px semibold) over subtitle (13px, muted), then an
  origin glyph and a pin glyph. Row radius 6, row gap 4.
- Grid mode: 5 columns, icon above a 2-line caption. Mixed result sets fall back to the list.
- Toolbar card: avatar, a 38px-high search field, and a power button that opens session actions
  inline. `search_position` is top or bottom.
- Keys:
  - Up/Down move the selection; Left/Right work in grid mode; PageUp/PageDown move by a page.
  - Return or Space activates.
  - Shift+Return opens the context menu (Open, desktop actions, Pin/Unpin); right-click opens it too.
  - Esc closes; Tab cycles focus.
- Animations: open is a 200ms ease-out-cubic reveal, close is 200ms ease-in-quad. A view change slides
  by min(12% of width, 72px) and fades from 0.78 to 1 opacity.
- It opens on the focused monitor. A click outside closes it, and state resets on close.

## Default palette ("Noctalia" dark, `src/theme/builtin_palettes.cpp:670-691`)
primary #fff59b, onPrimary #0e0e43, surface #070722, surfaceContainer #11112d,
onSurface #f3edf7, onSurfaceVariant #7c80b4, outlineVariant #21215F, hover #9BFECE.
- Selected row: primary background with onPrimary text.
- Cards: surfaceContainer background with a 1px outlineVariant border.
- Radius scale: 3 / 6 / 9 / 12. Spacing scale: 4 / 8 / 12 / 16.

## dmenu and custom command entries
- `noctalia dmenu [-p prompt]`: candidates on stdin, the choice on stdout; exits 1 on cancel.
  Transport is a Unix socket.
- Config entries: `command` (generates candidates), `exec` with `{selection}`/`{query}`, `prefix`,
  `label`, `glyph`, `global`, `freeform`.
- Plugins use Luau with an async `onQuery`/`setResults`/`onActivate` contract. We will not port Luau.

## Not portable
These parts depend on layer-shell, the compositor, or native libraries:
- the panel rendering;
- the window provider (`CompositorPlatform`);
- the panel provider (Noctalia panels);
- desktop-entry launching (`xdg-activation`);
- the calculator (libqalculate).
