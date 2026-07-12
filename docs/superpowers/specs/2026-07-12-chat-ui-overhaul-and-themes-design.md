# Chat-UI Quality Overhaul + Classic Terminal Themes — Design

**Date:** 2026-07-12
**Status:** Approved (brainstorm) — pending spec review
**Scope:** One combined effort. Core chat-view UX/layout quality pass **plus** a
first-party classic-terminal-scheme theme system. Design quality is the project's
stated #1 priority; the theme work rides on top of a layout worth theming.

## Problem

The shipped client (M5–M6) ported roughly 40% of the fidelity of its own design
mockups (`design/direction-*/index.html`). Seeded with real chat content and
compared head-to-head against the direction-A mockup, the app reads as a
"vibe-coded Lounge," not the Slack/IRCCloud bar we set out to hit. Concretely:

1. **The void.** `<Virtuoso alignToBottom>` in `MessageList.tsx` pins short
   conversations to the bottom of the pane, leaving a ~500px dead gulf between the
   topbar and the first message — the single loudest "empty prototype" tell.
2. **Weak group unit.** Grouping logic exists (`.msg` renders a name head, `.cont`
   hides it), but with no avatars, a 52px timestamp gutter, and real IRC's
   sender alternation, nearly every message becomes a new group = a bold name line
   + a body line. The result is simultaneously cramped (no inter-group rhythm) and
   wasteful (2 lines for a 3-word reply). Flat, no hierarchy, no hover affordance.
3. **Dead topbar.** Channel + topic hard-left, `N online` + dot + moon-icon
   hard-right, empty middle — and **no search field**, despite search being the
   headline wedge vs. The Lounge.
4. **Bare composer.** A thin terminal-y `>` pill vs. the mockup's real composer.
5. **Missing richness.** Mockup has avatars, date dividers, inline reactions, link
   previews, image cards; the app shipped the skeleton.

Separately, users want the **classic terminal color schemes** (Solarized, Gruvbox,
Dracula, Nord, Monokai, …). The theme architecture is already fully token-driven
and easily extended, and the A/B/C mockups already ship (partial) light palettes —
so this is ~50% groundwork, not greenfield.

## Goals

- Close the gap to the direction-A mockup, then **push past it** where the mockup
  is weak, to genuinely hit a Slack/IRCCloud-grade core chat view.
- Ship a rich set of first-party **classic terminal themes** with light+dark pairs,
  presented in a real swatch-card picker.
- Finish the long-deferred **light-mode wiring** (`TODO(m6)`) as a first-class path.

## Non-goals

- No protocol/server changes. This is a client presentation + theming effort.
- No new chat *features* (threading, etc.) beyond presenting what already exists
  (reactions, replies, typing, previews, uploads).
- Reaction persistence, EXIF strip, real-device push E2E remain out of scope.

## Approach

Mockup is the **floor**. The exact pixel-level decisions (spacing scale, avatar
style/size, type ramp, divider treatment) are locked via a `frontend-design` study
at the start of implementation — a static mockup of the redesigned message pane +
topbar + composer, iterated and screenshot-verified — then ported to the real
components. This keeps "push past it" honest and measurable rather than hand-waved.

## Part A — Core chat-view overhaul

### A1. Kill the void (MessageList.tsx)
- Remove `alignToBottom`. Top-anchor short conversations (content grows from the
  top of the pane). Preserve "stick to bottom on new message" **only when the user
  is already at/near the bottom** (Virtuoso `followOutput` returning `'smooth' |
  false` based on at-bottom state; keep `atTopStateChange` history loading).
- Empty state stays centered but is redesigned to feel intentional, not blank.

### A2. Redesign the message group unit (MessageRow.tsx + app.css)
- **Avatar column.** Introduce compact letter/identicon avatars (deterministic
  color via the existing `hashNick`). Shown once per group; continuations align to
  the same left edge. Density-aware size (`--avatar` already exists; terminal-mode
  zero becomes a real value, tunable per density).
- **Inline header.** Sender name sits **inline with the first line's body start**
  (name + hover-time on the group's first row), not on a standalone head line, to
  cut the 2-line tax while keeping scannability. Continuations: body only, time
  revealed in-gutter on row hover (existing behavior, refined).
- **Rhythm.** Tighten intra-group spacing; increase inter-group `--group-gap`.
  Retune the gutter width now that avatars carry identity. All via density tokens
  so compact/comfortable both improve.
- **Dividers.** Day dividers ("Today" / "Yesterday" / date) between groups that
  cross a day boundary; a single **unread** divider at the first unread message.
- **Hover hierarchy.** Row hover keeps the `--bg-3` wash; add a floating action bar
  (react · reply · more) anchored top-right of the hovered group (extends the
  existing `.reply-btn` reveal). Strengthen name/time/body contrast ramp.

### A3. Topbar (topbar component + app.css)
- Rebalance into three zones: **left** channel `# name` + topic (truncating);
  **center** a real **search field** that opens the existing SearchPanel / Cmd-K
  flow; **right** member count + connection indicator + appearance/notifications.
- The search field is the visible headline wedge; keyboard shortcut hint inline.

### A4. Composer (Composer + app.css)
- From bare `>` pill to a real composer: autogrowing textarea, inline formatting
  affordances (bold/italic/code), emoji trigger + the existing 📎 upload, and a
  slash-command hint. Keep the send/newline/commands hint row but restyle.

## Part B — Theme system (folded in)

### B1. Themes (14 total), two groups
**bool group:** `a` (default, `:root`), `a-light`, `b`, `b-light`, `c`, `c-light`,
`shimmer` *(dark-only; its mockup has no light block and the sibling shimmer
project owns "light warm")*.

**Classic group:** `solarized-dark`, `solarized-light`, `gruvbox-dark`,
`gruvbox-light`, `dracula`, `nord`, `monokai`. Dark-only classics (Dracula, Nord,
Monokai) are simply single cards — no light/dark toggle anywhere; every variant is
its own card (flat list).

### B2. Token blocks (tokens.css)
- Each new theme = one `[data-theme="<slug>"]` block overriding the **full** token
  contract: `--bg-0..4`, `--line`/`--line-2`, `--ink-0..3`, all seven accents
  (`--green/--amber/--cyan/--red/--violet/--blue` + dims), the seven `--m-*` chat
  colors, and semantics `--on-accent`, `--glow`/`--glow-strong`, `--focus`. Light
  themes additionally override `--scrim` and `--shadow-overlay`.
- Classic accents are pulled from each scheme's canonical ANSI-16 palette; the
  `--m-*` chat palette maps to the scheme's bright ANSI set.
- `a-light`/`b-light`/`c-light` are seeded from the mockup `[data-theme="light"]`
  blocks (which only define bg/ink/one-accent under mockup-local var names) and
  **completed** to the full contract.
- **WCAG discipline:** verify text-on-bg and ink-on-accent contrast for every
  theme; adjust derived steps to pass.

### B3. Wiring (theme.ts)
- `ThemeId` becomes the 14-slug union. `applyAppearance` is unchanged in shape —
  `a` clears `data-theme`, every other slug sets `data-theme="<slug>"`. localStorage
  persists the slug (existing keys).

### B4. Picker (new ThemeSwatch component + AppearanceMenu.tsx)
- `ThemeSwatch`: a selectable card showing the theme name + a strip of ~5 real
  palette chips. Each theme carries a static `swatch: string[]` (key colors) in its
  metadata so previews render without applying the theme globally.
- `AppearanceMenu` renders two labeled groups (**bool** / **Classic**); selected
  card outlined via `--focus`; `aria-pressed`, keyboard-navigable grid.

## Part C — Light-mode / token cleanup (app.css)

Route hardcoded dark values through tokens so light themes render correctly:
- The two dialog backdrops `rgba(4,6,7,…)` → `var(--scrim)`.
- The amber mention tint `rgba(255,180,84,.22)` → `color-mix(in srgb, var(--amber) …)`.
- The hardcoded blue pill (`rgba(122,162,247,.1)` / `rgba(47,69,112,1)`) → tokened.
- Black drop-shadows (`rgba(0,0,0,…)`) may stay (fine on light).

## Testing & verification

- **Unit (vitest):** message grouping/day-divider/unread-divider logic; MessageList
  top-anchor vs. stick-to-bottom behavior; each theme slug → correct `data-theme`;
  localStorage round-trip; `ThemeSwatch` renders N chips; assert light themes define
  `--scrim`; AppearanceMenu group rendering + selection.
- **Visual (chrome-devtools + `window.__bool` seed, per bool-visual-verify):**
  screenshot the redesigned pane populated; verify at least Solarized Light (light
  path) + Dracula + default A; compare against the frontend-design study target.
- Keep the existing suite green (currently 406+); typecheck clean.

## Risks / decisions

- **Avatars in "terminal" mode.** Direction A intentionally shipped `--avatar:0`.
  Adding avatars is a "push past the mockup" call; the design study confirms style
  (letter vs. identicon) and whether A stays avatar-optional. Tunable via token.
- **14 themes is a lot.** Grouped swatch cards keep it scannable; the flat-card
  model avoids toggle logic. WCAG passes are the main per-theme cost.
- **Virtuoso top-anchor.** Must not regress history-paging (`atTopStateChange`) or
  the read-marker debounce; covered by unit tests + visual check.
