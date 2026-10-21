# Design System — "Bento Workspace"

**Status:** decided in Stage 3 (2026-10-19). Tokens live in `frontend/src/styles/tokens.css` and are mapped into Tailwind in `frontend/tailwind.config.js`. Components live in `frontend/src/ui/`.

## 1. Style decision

The product is an **authenticated developer workspace**. People spend most of their time reading source code, JSON, validation output and a rendered preview side by side. The style has to keep that content legible and dense, and still look like a deliberate product rather than a debug page.

Scoring is 1–5 (5 = best fit) across the criteria in the brief:

| Style | Code readability | Credibility (dev tool) | A11y / contrast | Density | Render cost | Responsiveness | Maintenance | Verdict |
|---|---|---|---|---|---|---|---|---|
| Skeuomorphism | 2 | 2 | 3 | 2 | 3 | 3 | 2 | Rejected. Ornament competes with code |
| Neomorphism | 2 | 2 | **1** (low-contrast edges by definition) | 3 | 3 | 3 | 2 | Rejected. Fails AA for boundaries |
| Glassmorphism (full) | 2 | 3 | 2 (text over blur varies) | 3 | **2** (backdrop-filter everywhere) | 3 | 3 | Rejected as *dominant* style |
| Claymorphism | 2 | 1 | 3 | 2 | 3 | 3 | 3 | Rejected. Toy-like |
| Brutalism | 4 | 3 | 4 | 4 | 5 | 4 | 4 | Plausible, but polarising for a paid tool |
| Minimalism | 5 | 4 | 5 | 3 | 5 | 5 | 5 | Strong base, but no structure for a multi-panel workspace by itself |
| Maximalism | 1 | 2 | 2 | 2 | 2 | 2 | 1 | Rejected |
| Liquid Glass | 2 | 3 | 2 | 3 | **1** (refraction/specular layers) | 3 | 2 | Rejected. Cost and contrast risk |
| **Bento Grid (layout)** | 5 | 5 | 5 | **5** | 5 | **5** | 4 | **Selected as layout system** |
| Spatial UI | 2 | 3 | 3 | 2 | 1 | 2 | 2 | Rejected. No depth axis needed |

**Selected:** **Bento Grid layout + minimalist solid surfaces + restrained glass + strong type hierarchy.** This is the default hypothesis, kept because the evidence supports it:

- **Bento** maps one-to-one onto the real workflow panels: input, progress, result, source/overlays, validation, history. Multi-span tiles give the result panel the space it needs without nested scroll traps.
- **Content tiles are solid** (`--surface-1`). Code and JSON are never placed over translucent or blurred backgrounds.
- **Glass is limited to two floating layers:** the sticky top bar and modal/overlay chrome. These are the only places where seeing the content underneath helps orientation. Blur radius is capped at 14px. Glass falls back to an opaque surface when `backdrop-filter` is unsupported **or** `prefers-reduced-transparency: reduce` is set.
- **Hierarchy comes from typography and spacing, not shadows.** Each tile has one hairline border and at most one soft elevation.

What this replaces: ad-hoc hex colours in `tailwind.config.js`, one-off component classes (`panel-button`, `workspace-panel`) and a single fixed dark theme.

## 2. Tokens

All colours are CSS custom properties on `:root[data-theme]`. The theme follows `prefers-color-scheme` until the user picks one, then that choice is stored in `localStorage` (a per-viewer convenience).

### Colour (contrast ratios computed with the WCAG 2.x formula, not estimated)

| Token | Dark | Light | Use | Contrast (dark / light) |
|---|---|---|---|---|
| `--bg` | `#0b0c10` | `#f5f6f8` | App background | — |
| `--surface-1` | `#13151b` | `#ffffff` | Tiles | — |
| `--surface-2` | `#1a1d25` | `#f0f2f5` | Insets, code gutters, inputs | — |
| `--surface-glass` | `rgb(19 21 27 / .72)` | `rgb(255 255 255 / .72)` | Top bar, modal chrome only | — |
| `--border` | `#2a2e3a` | `#dfe2e8` | Decorative tile edges | 1.35 / 1.30 (decorative only) |
| `--border-strong` | `#5d6478` | `#858c9c` | Input/control boundaries | **3.09 / 3.37** vs surface-1 (≥ 3:1 non-text) |
| `--text` | `#e9ebf1` | `#11141b` | Primary text | 15.31 / 18.43 on surface-1 |
| `--text-muted` | `#a6acbb` | `#474e5e` | Secondary text | 8.03 / 8.34 |
| `--text-subtle` | `#8a91a3` | `#5c6374` | Captions, metadata | 5.79 / 6.01 (≥ 4.5 AA) |
| `--accent` | `#8b97ff` | `#3f4bc9` | Links, focus ring, active tab | 6.92 / 6.86 |
| `--accent-bg` | `#4f5ce0` | `#3f4bc9` | Primary button fill | white text: 5.33 / 6.86 |
| `--success` | `#3ecf8e` | `#137a4b` | Valid / complete | 9.14 / 5.37 |
| `--warning` | `#f5b440` | `#8a5a00` | Needs review | 9.98 / 5.93 |
| `--danger` | `#ff7a7a` | `#c0352f` | Errors / failed | 7.23 / 5.54 |

The focus ring is a 2px `--accent` outline with a 2px offset. It measures 7.42 against the dark background and 6.34 against the light one.

### Typography

Fonts are self-hosted via `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono`, so there are no third-party font requests and the CSP stays `'self'`.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `display` | 28 / 34 | 650 | Page title (1 per screen) |
| `title` | 18 / 26 | 600 | Tile titles |
| `body` | 14 / 22 | 400 | Default |
| `label` | 13 / 18 | 500 | Form labels, tabs |
| `caption` | 12 / 16 | 450 | Metadata, eyebrow (uppercase, +0.06em tracking) |
| `code` | 13 / 20 mono | 400 | Code, JSON, logs |

### Spacing, radius, elevation, layout

- **Spacing:** 4px base. Scale `1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48`. Bento gutter is `--space-4` (16px) on mobile and `--space-5` (20px) from tablet up.
- **Radius:** `--radius-sm 6px` (chips, inputs), `--radius-md 10px` (buttons), `--radius-lg 16px` (tiles), `--radius-xl 22px` (auth card, modal).
- **Elevation:** `--shadow-1` (tiles: `0 1px 0 rgb(0 0 0/.04), 0 8px 24px -12px rgb(0 0 0/.25)`), `--shadow-2` (modals). No other shadows.
- **Breakpoints:** `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`.
- **Icons:** 16px inline, 20px in buttons, 24px for empty states. Icons are inline SVG with `aria-hidden` and a text label next to them.
- **Motion:** `--dur-fast 120ms`, `--dur-base 200ms`, easing `cubic-bezier(.2,.8,.2,1)`. Motion is used only for state feedback (hover, tab change, progress). Under `prefers-reduced-motion: reduce`, every duration becomes `0.01ms` and the progress shimmer is removed.

## 3. Bento workspace layout

The grid is CSS Grid with named areas, so tile order in the DOM matches reading order and the visual order matches on every breakpoint.

```
Desktop ≥1280 (12 cols)                      Tablet 768–1279 (8 cols)     Mobile <768 (1 col)
┌──────────┬───────────────────────────┐     ┌──────────────────────┐    input
│ input  4 │ progress               8  │     │ input             8  │    progress
├──────────┼───────────────────────────┤     │ progress          8  │    result
│ source 4 │                           │     │ result            8  │    source
├──────────┤ result                 8  │     ├──────────┬───────────┤    validation
│ valid. 4 │  (tabs: preview/code/     │     │ source 4 │ valid.  4 │    history
│          │   schema/report)          │     ├──────────┴───────────┤
├──────────┴───────────────────────────┤     │ history           8  │
│ history                           12 │     └──────────────────────┘
└──────────────────────────────────────┘
Left rail (≥1024): project navigator, collapsible. Below 1024 it becomes a drawer opened from the top bar.
```

**Tile rules**
- A tile exists only when it holds a distinct task or result. There are no decorative tiles.
- One level of nesting at most: tile → content. Tiles never contain tiles.
- Long content (source, JSON, logs) scrolls *inside* the tile body with `max-block-size` and a visible scrollbar. The page never scrolls horizontally, and code wraps off by default with horizontal scroll inside the code block only.
- Progressive disclosure: debug diagnostics and raw JSON live behind a "Details" disclosure. Overlays are an explicit toggle.
- Primary action ("Generate") is always in the input tile and repeated in the top bar on mobile.

## 4. Components (`frontend/src/ui/`)

Components are built only where reuse is real:

| Component | Variants / states |
|---|---|
| `Button` | `primary`, `secondary`, `ghost`, `danger`; sizes `sm`, `md`; `disabled`, `loading` (spinner + `aria-busy`) |
| `Tile` | Title, optional eyebrow, actions slot, scrollable body; `aria-labelledby` wiring |
| `Field` / `TextInput` / `TextArea` | Label, hint, error (`aria-invalid` + `aria-describedby`), character counter |
| `Alert` | `info`, `success`, `warning`, `danger`; `role="alert"` for errors, `role="status"` otherwise |
| `StatusBadge` | Job status → colour + text (never colour alone) |
| `Tabs` | WAI-ARIA tabs pattern with arrow-key navigation |
| `Spinner`, `EmptyState`, `Modal` (existing `FullViewModal` with focus trap) |

## 5. Interaction & state requirements

Every workflow screen must render each of these states explicitly:

| State | Treatment |
|---|---|
| Initial / empty | `EmptyState` with the next action |
| Loading | Skeleton or spinner *with text* (no bare spinners) |
| In progress | Per-stage progress with the current stage named and a Cancel action |
| Success | Status badge + result tabs |
| Validation failure | `warning` alert with what failed; result still inspectable |
| Recoverable failure | `danger` alert + Retry; input preserved |
| Fatal / config | Full-tile explanation (e.g. Supabase not configured) without internals |

Focus is always visible, and every interactive element is reachable by keyboard. Modals trap and restore focus. Colour is never the only carrier of meaning.

## 6. Do / don't

- **Do:** use tokens only. A hex literal in a component is a review failure.
- **Do:** keep the generated-preview iframe visually neutral. Generated apps bring their own styles.
- **Don't:** use blur on anything that contains text the user reads for more than a glance.
- **Don't:** animate layout (width, height, grid). Animate opacity and transform only.
