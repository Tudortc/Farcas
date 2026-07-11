# bool — "Shimmer-family" direction

A same-studio continuation of the **shimmer** design system ("warm pantry
editorial"), adapted for bool's dark-first, dense, keyboard-driven developer
chat personality. The goal: bool should feel unmistakably from the same studio
as shimmer, without looking like a light app forced into dark mode.

Open `index.html` directly in a browser. The Cmd-K palette is shown open by
default (press **Esc** to dismiss, **⌘K** to reopen). The **Compact /
Comfortable** toggle lives in the top bar.

---

## What carried over from shimmer (the DNA)

- **Token architecture & naming** — identical convention: `--color-*`,
  `--space-*` (4px base), `--text-*`, `--radius-*`, `--duration-*`,
  `--ease-standard`, `--focus-ring`. A `:root` block in the same house style,
  including `color-mix()`-derived state colors.
- **Radii** — 8 / 14 / 22px + full pill, unchanged.
- **Motion** — exact shimmer values: `--duration-fast 160ms`,
  `--duration-base 300ms`, `--duration-slow 600ms`,
  `--ease-standard cubic-bezier(.22, 1, .36, 1)`.
- **Focus ring** — 2px solid accent with 2px offset.
- **Fonts** — the Fraunces + Nunito Sans pairing. Fraunces (with shimmer's
  `SOFT 60 / WONK 1` variation settings) for the wordmark and channel-name
  headers; Nunito Sans for all UI/body text.
- **Warm, editorial soul** — soft corners, warm-tinted diffuse shadows, an
  olive accent, terracotta for danger, and a subtly textured (not flat) ground.

## What was adapted (because bool ≠ shimmer)

### 1. The warm-dark palette (the key creative task)

Shimmer is **light-only**: cream ground `#faf5ec`, espresso ink `#2a241c`.
I did **not** invert to cold slate. Instead I rotated shimmer's own espresso
hue (~30°, warm) down into near-black to build the ground, and promoted
shimmer's cream to the on-dark ink. The accent and danger were lifted in
luminance so they glow against espresso instead of muddying.

| Token | Hex | Role | Derived from |
|---|---|---|---|
| `--color-bg` | `#1a1611` | app ground (roasted coffee) | espresso ink, darkened, hue kept |
| `--color-bg-sunken` | `#141109` | gutters, sidebars, code bg | ground −luminance |
| `--color-surface` | `#221d16` | raised panes, message hover | ground +luminance |
| `--color-surface-2` | `#2b251c` | composer, popovers, cards | surface +luminance |
| `--color-line` | `#37301f` | warm hairlines (NOT gray) | espresso midtone |
| `--color-ink` | `#f3ead9` | primary text (parchment) | shimmer cream, on-dark |
| `--color-ink-muted` | `#a2937b` | timestamps, meta (taupe) | ink desaturated |
| `--color-ink-faint` | `#6f6450` | joins/parts, disabled | ink further muted |
| `--color-accent` | `#9db665` | olive that pops on dark | shimmer olive `#4e5f2e` lifted |
| `--color-accent-dim` | `#6f8544` | rings/borders at rest | accent −luminance |
| `--color-accent-ink` | `#171307` | text ON accent fill | near-black warm |
| `--color-danger` | `#e08159` | mentions + danger | shimmer terracotta `#a93b22` lifted |

**Contrast (on `--color-bg #1a1611`):** ink ≈ 13.5:1, ink-muted ≈ 6.0:1,
accent ≈ 8.2:1, danger ≈ 7.4:1 — all comfortably AA (most AAA) for text.

**Chat nick palette** — six warm, mIRC-friendly hues (`clay, amber, olive,
teal, dusty-blue, orchid`) chosen to stay inside the warm editorial family and
to be distinguishable on espresso without the harsh neon of a typical IRC
client.

The ground is not a flat void: two low-opacity radial gradients (olive top-left,
terracotta bottom-right) plus warm scrollbars keep the "warm paper" feeling
alive in the dark.

### 2. Fonts + the mono addition (justified)

Fraunces + Nunito Sans is carried over verbatim. bool **adds a third face,
JetBrains Mono**, used only for nicks, timestamps, code, badges, and keyboard
hints. Justification: a dense IRC log lives or dies on vertical scan-ability —
a monospaced gutter makes timestamps and nicks line up into clean columns, and
code/inline-code needs a real mono anyway. It's a warm-toned humanist mono, so
it sits comfortably beside Nunito Sans rather than fighting it. Prose message
text stays in Nunito Sans for readability.

### 3. Density (bool's headline feature)

Shimmer is spacious. bool must be compact by default to fix The Lounge's #1
complaint (wasted vertical space). Density is a real, token-driven treatment,
not cosmetic: a `data-density` attribute on `<html>` remaps a small set of
derived variables that every row consumes.

| Variable | Compact (default) | Comfortable |
|---|---|---|
| `--d-row-py` (message vertical padding) | `2px` | `7px` |
| `--d-row-gap` (gap between messages) | `2px` | `5px` |
| `--d-msg-size` (message font size) | `0.875rem` | `0.9375rem` |
| `--d-msg-lh` (message line-height) | `1.42` | `1.6` |
| `--d-nav-py` (sidebar/member row padding) | `3px` | `6px` |

Compact fits roughly 60–70% more messages on screen than Comfortable while
staying readable — tight rhythm, but a 1.42 line-height and generous horizontal
padding keep it from feeling cramped. The toggle is in the top bar and is also
exposed as a Cmd-K action.

---

## Verdict — does the shimmer-family look suit a dense dark IRC client?

**Mostly yes, and more than I expected.** The warm-dark ground is the reason it
works: an espresso-brown chat log reads as calm and "cozy terminal," which is a
genuinely distinctive and pleasant place for developers to sit all day —
nothing else in the IRC-client space looks like this, and it clearly reads as a
sibling of shimmer rather than a generic dark theme.

The honest tension: shimmer's **serif display + soft 22px radii** signal
"editorial / unhurried," which is slightly at odds with the machine-gun density
of IRC. I resolved it by keeping Fraunces for *identity* moments only (wordmark,
channel-name header) and letting the mono + Nunito Sans carry the dense log, so
the serif never has to do dense work. The soft radii are reserved for cards,
popovers, and the palette; message rows themselves are radius-free and column-
aligned. With those two disciplines the editorial DNA becomes an *accent* on a
fundamentally utilitarian layout — which is exactly the balance a same-studio
continuation needs. If forced to name a risk: at extreme density the warmth
could feel decorative to hardcore terminal users, but the Compact default plus
the AA-contrast palette keep it firmly usable.

**File:** `/Users/dmfarcas/Projects/bool/design/direction-shimmer/index.html`
