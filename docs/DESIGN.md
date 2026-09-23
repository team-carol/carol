# carol — Design System

> **Brand palette:** web pages and the PNG rating/achievement cards follow the carol-web landing design system (team-carol/carol-web `app/globals.css`). Values live in `src/brand.ts` (`BRAND`); web pages use them as CSS variables via `src/web/theme.ts`. Canvas `#1a1a1c`, surface `#242427`, border `#33333a`, text `#f2edef`/`#cfc6ca`, accent coral `#ff9294` (text on accent `#3a1e1e`). Cards bump `CARD_VERSION` / `ACH_CARD_VERSION` on palette changes so cached PNGs re-render.
>
> Card shapes follow the landing too: panels and rows are rounded (16px) surface boxes with a 1px border; jacket tiles are rounded (10px); difficulty, rank and "TOP N" labels are pills instead of colored stripes. The wordmark is `carol` (ink) + `bot` (accent).
>
> The neutral/accent tokens in the tables below are the **old purple palette** and are kept only for history. The difficulty, rank and combo colors further down are game colors and are still in use.

---

## Colour Tokens

### Canvas & Surfaces

| Token | Value | Usage |
|---|---|---|
| `--canvas` | `#0d0d0d` | Page / card background |
| `--surface` | `#1a1a1a` | Cards, panels |
| `--surface-alt` | `#1c1c1c` | Jacket placeholder |
| `--surface-overlay` | `#242424` | Elevated surface (avatar placeholder) |

### Borders & Dividers

| Token | Value | Usage |
|---|---|---|
| `--border` | `#252525` | Card outer border (1px) |
| `--border-soft` | `#2a2a2a` | Bookmarklet overlay panel border |
| `--divider` | `#1e1e1e` | Header `border-bottom` |
| `--divider-soft` | `#202020` | Section label separator |

### Accent

| Token | Value | Usage |
|---|---|---|
| `--accent` | `#9333ea` | MASTER diff, rating value, wordmark, primary CTAs |
| `--accent-light` | `#c084fc` | Re:MASTER diff, links |
| `--dx-badge` | `#f97316` | DX chart type indicator |

### Text Hierarchy

| Token | Value | Usage |
|---|---|---|
| `--text-primary` | `#ffffff` | Headings, values, player name |
| `--text-body` | `#cccccc` | Body text, overlay status messages |
| `--text-secondary` | `#aaaaaa` | Section labels |
| `--text-muted` | `#888888` | Wordmark prefix, timestamps |
| `--text-dim` | `#777777` | "RATING" label |
| `--text-xdim` | `#666666` | Meta / rank label |
| `--text-overlay` | `#dddddd` | Song title on jacket |

### Overlay Text (Opacity Scale)

| Token | Value | Usage |
|---|---|---|
| `--overlay-hi` | `rgba(255,255,255,0.90)` | Level value on jacket |
| `--overlay-mid` | `rgba(255,255,255,0.78)` | Achievement on jacket |
| `--overlay-lo` | `rgba(255,255,255,0.70)` | Rank badge number |
| `--overlay-dim` | `rgba(255,255,255,0.65)` | ST type indicator |

---

## Difficulty Colors

| Difficulty | Value |
|---|---|
| BASIC | `#16a34a` |
| ADVANCED | `#ea580c` |
| EXPERT | `#dc2626` |
| MASTER | `#9333ea` |
| Re:MASTER | `#c084fc` |

## Rank / Combo Colors

| Rank / Combo | Value |
|---|---|
| SSS+ | `#d97706` |
| SSS | `#f59e0b` |
| SS+ / SS | `#fbbf24` |
| S+ / S | `#fb923c` |
| AAA / AA | `#60a5fa` |
| A | `#93c5fd` |
| BBB | `#7dd3fc` |
| BB | `#bae6fd` |
| B | `#e0f2fe` |
| C | `#d1d5db` |
| D | `#9ca3af` |
| AP+ / AP | `#d946ef` |
| FC+ | `#3b82f6` |
| FC | `#60a5fa` |
| FSD+ | `#10b981` |
| FSD | `#34d399` |
| FS+ | `#22c55e` |
| FS | `#4ade80` |

---

## Typography

**Fonts:**
- **Inter** — web pages (body + UI)
- **JetBrains Mono** — monospace, step numbers, code snippets
- **NotoSansJP 400 + 700** — satori PNG render (downloaded from jsDelivr, cached in `{DATA_DIR}/fonts/`)

### Rating Card Type Scale (satori, rendered at 2×)

| Role | Size | Weight |
|---|---|---|
| RS value | 19px | 800 |
| Rating total | 20px | 800 |
| Player name | 12px | 700 |
| Level | 9px | 700 |
| Achievement | 8px | 600 |
| Song title | 9px | 600 |
| Diff / rank label | 7px | 700 |
| Rank badge number | 8px | 600 |
| Section label | 10px | 700 |
| Trophy | 8px | 400 |
| Wordmark | 13px | 700–800 |

---

## Rating Card Layout

Rendered via satori + `@resvg/resvg-js`, output PNG at 2× scale:

| Property | Value |
|---|---|
| `CARD_W` | 110px |
| `CARD_H` | 115px |
| `GAP` | 4px |
| Padding | 16px |
| NEW section | 3 columns, ranks 1–15 |
| OTHERS section | 7 columns, ranks 1–35 |
| Card top border | 3px solid in difficulty color |
| Card outer border | 1px solid `#252525` |

### Jacket Gradient Overlay

```
linear-gradient(to bottom,
  rgba(0,0,0,0.35)  0%,
  rgba(0,0,0,0.05) 28%,
  rgba(0,0,0,0.65) 55%,
  rgba(0,0,0,0.93) 100%
)
```

### Wordmark

```
"Created by"  →  color: #888
"carol"      →  color: #fff, fontWeight: 800
"bot"         →  color: #9333ea, fontWeight: 800
```

---

## HTML Pages — CSS Baseline

Apply to all web routes (`/sync`, `/privacy`, `/terms`):

```css
:root {
  --canvas:        #0d0d0d;
  --surface:       #1a1a1a;
  --border:        #252525;
  --border-soft:   #2a2a2a;
  --accent:        #9333ea;
  --accent-light:  #c084fc;
  --text:          #cccccc;
  --text-hi:       #ffffff;
  --text-lo:       #888888;
  --success:       #4ade80;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: var(--canvas);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

a { color: var(--accent-light); }

code {
  font-family: 'JetBrains Mono', monospace;
  background: #111;
  border: 1px solid var(--border);
  padding: 1px 6px;
  border-radius: 4px;
  color: var(--accent-light);
}
```

### Button / CTA

```css
.btn-primary {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 12px 24px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity .15s;
}
.btn-primary:active { opacity: .8; }
```

### Surface Card

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
}
```
