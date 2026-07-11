# bool — Design Study Notes

**Date:** 2026-07-11 · **Scope:** core three-pane chat view + Cmd-K palette + global search
**Priority:** Design/UX quality is the #1 goal of the project.

These notes document the three visual directions, their design tokens, how each
satisfies the hard **compact-by-default with a real density toggle** requirement
(the #1 The Lounge complaint we must beat), and a final recommendation.

All mockups are standalone `index.html` files with inline CSS and a few lines of
vanilla JS. Open them directly in a browser. Each has a **theme toggle** (dark
default, light included) and a **Compact ⇄ Comfortable** toggle wired live.

---

## The problem we're designing against

The Lounge — the market leader — loses users on exactly one axis: **it wastes
screen space and forces CSS hacking to get density.** Every direction here treats
**density as a first-class, one-click feature**, not a hidden hack. Compact is the
*default*. The whole layout is driven by a small set of CSS custom properties
under `[data-density="compact"]` / `[data-density="comfortable"]`, so the toggle
retunes row padding, line-height, font size, avatar size and group spacing in one
place — nothing is hardcoded.

Shared layout across all three: a slim **network rail** (icons per IRC network) ·
a **channel/DM sidebar** (grouped, with unread badges + mention highlights) · the
**message list** (grouped consecutive messages, IRC-authentic timestamps, mIRC
colors, code blocks, link previews, inline images, replies, reactions, typing,
join/quit lines) · an optional collapsible **member list** (ops / voiced / online).

---

## Direction A — "Terminal-Modern"

> Dense · monospace-accented · hacker-native · phosphor accents

**Personality.** Made *by* IRC people *for* IRC people. Near-black cold graphite,
phosphor-green primary accent, amber for mentions/highlights. Monospace is used
deliberately as an *accent* (timestamps, nicks-of-record, network codes, the `›`
composer prompt, code) while UI chrome uses a clean humanist sans so it never
feels like a 1998 terminal. Highest information density of the three; feels fast
and precise. This is the direction that most directly answers the "wasted space"
complaint and signals "power tool."

**Signature moves.** Left timestamp gutter on every message (real IRC feel);
`#` in phosphor green; op/voice sigils (`@`/`+`) rendered inline; a prompt-style
composer (`›`) with a slash-command autocomplete panel; a status line showing the
live IRCv3 caps (`echo-message · labeled-response`) as a quiet nod to the
engine underneath.

**Typography.** Display/accent: **JetBrains Mono** · UI/body: **IBM Plex Sans**.

**Tokens (dark):**
- Backgrounds: `--bg-0 #0a0c0d` → `--bg-4 #1b2226` (5-step ramp)
- Hairlines: `--line #20282c`, `--line-2 #2a343a`
- Text: `--ink-0 #e6efe9` / `--ink-1 #9fb1ab` / `--ink-2 #63756f` / `--ink-3 #455049`
- Accents: `--green #39e08b` (brand), `--amber #ffb454` (mention), `--cyan #4fd6e0`, `--blue #7aa2f7`, `--red #ff6b6b`, `--violet #b48ead`
- mIRC render palette: tokyonight-derived (`#f7768e #9ece6a #e0af68 #7aa2f7 #bb9af7 #7dcfff #ff9e64`)
- Radius: `4 / 6px`

**Density values:**
| Token | Compact (default) | Comfortable |
|---|---|---|
| `--row-py` | 2px | 5px |
| `--group-gap` | 10px | 18px |
| `--msg-fs` | 13px | 14px |
| `--msg-lh` | 1.45 | 1.6 |
| `--meta-fs` | 11px | 12px |
| `--side-row-h` | 24px | 30px |
| avatars | none | none (text-forward) |

---

## Direction B — "Soft-Editorial"

> Warm · premium consumer · spacious-but-efficient · literary

**Personality.** The "open-source IRCCloud" as a *premium consumer product*.
Espresso-and-parchment warmth instead of cold black; a **Fraunces** serif gives
headings, channel names and reply quotes an editorial, magazine quality. Channel
topics render in italic *Newsreader* like a standfirst. It reads calm and
expensive — the direction most likely to make someone say "wait, this is IRC?".
Crucially it stays efficient: compact mode is genuinely tight; the warmth comes
from color and type, not from wasted whitespace.

**Signature moves.** Rounded avatars with per-user gradient tints; serif nicks;
warm amber brand accent that doubles as the mention/self-highlight color; a
soft focus glow on the composer; join/quit lines styled as quiet italic asides
rather than noisy system spam.

**Typography.** Display: **Fraunces** (optical-size aware) · Body: **Spline Sans**
· Reading/quotes: **Newsreader** italic · Mono: **Spline Sans Mono**.

**Tokens (dark / "espresso"):**
- Backgrounds: `--bg-0 #17130f` → `--bg-active #33291f`; raised `--paper #231d17`
- Hairlines: `--line #332a20`, `--line-2 #42352a`
- Text: `--ink-0 #f3ece1` / `--ink-1 #c3b5a3` / `--ink-2 #8f8172` / `--ink-3 #635849`
- Accents: `--accent #e8a76b` (brand amber), `--accent-deep #c9793a`, `--rose #e58a8a`, `--sage #a3c48f`, `--sky #8fb6d6`, `--plum #c79bd4`
- Light theme is a true **cream paper** (`#faf5ec` pane on `#efe7da` frame) — this
  direction is the strongest of the three in *light* mode.
- Radius: `9 / 12 / 18px` (softest of the three)

**Density values:**
| Token | Compact (default) | Comfortable |
|---|---|---|
| `--msg-py` | 4px | 9px |
| `--grp-gap` | 14px | 26px |
| `--msg-fs` | 14.5px | 15.5px |
| `--msg-lh` | 1.5 | 1.72 |
| `--side-h` | 34px | 42px |
| `--avatar` | 30px | 38px |

---

## Direction C — "Neo-Aurora"

> Community-first · colorful · glossy · vibrant depth

**Personality.** For communities migrating *from* Discord/Slack who want that
familiar shape without the bloat. Midnight-indigo canvas lit by **aurora**
gradients (violet → pink, cyan → violet). Glossy, energetic, friendly. Rounded
everything, gradient avatars, gradient active states, a gradient send button.
It's the most immediately "modern app"-looking and the easiest sell to
non-IRC-natives — while staying far calmer and more legible than Discord itself
(more negative space, restrained per-message chrome, a real compact mode).

**Signature moves.** Gradient brand mark and network-active pills; animated
gradient border on the active channel; cyan unread dot with glow; "traffic-light"
code-block header; gradient link-preview thumbnails; day divider as a centered
pill. Color is doing the heavy lifting, so type stays clean geometric sans.

**Typography.** Display: **Sora** · Body: **Outfit** · Mono: **JetBrains Mono**.

**Tokens (dark):**
- Backgrounds: `--bg-0 #0b0b16` / `--bg-2 #0e0e1e`; surfaces `--surface #181733` → `--active #252248`
- Hairlines: `--line #242243`, `--line-2 #322f5c`
- Text: `--ink-0 #f0eefe` / `--ink-1 #b7b3dc` / `--ink-2 #7b78a6` / `--ink-3 #524f7a`
- Aurora accents: `--violet #8b7dff` (brand) + `--pink #ff6ec7` + `--cyan #4fe0d8` + `--lime #a6f065` + `--amber #ffc857` + `--coral #ff7a70` + `--sky #5cc7ff`
- Gradients: `--grad` violet→pink, `--grad-cool` sky→violet
- Radius: `10 / 14 / 20px`

**Density values:**
| Token | Compact (default) | Comfortable |
|---|---|---|
| `--msg-py` | 3px | 8px |
| `--grp-gap` | 12px | 24px |
| `--msg-fs` | 14px | 15px |
| `--msg-lh` | 1.48 | 1.68 |
| `--side-h` | 34px | 44px |
| `--avatar` | 32px | 40px |

---

## Cross-direction system (shared design language)

**Spacing scale.** 2 · 4 · 8 · 12 · 16 · 22/26px gutters. Compact mode collapses
toward the low end; comfortable expands.

**Type scale (body-relative).** meta 10–12px · body 13–15.5px · nick 14–15px ·
channel title 15–24px (A→B). A uses the tightest, B the most expressive.

**Message grouping.** Consecutive messages from one author collapse into a group:
full header on the first row, continuation rows share the gutter and reveal their
timestamp on hover. This is the single biggest density win and is identical in
concept across all three.

**Status & IRCv3 honesty.** Presence dots (online/idle/off), typing indicator,
delivery hints ("delivered instantly", "synced to all devices", live caps) surface
the always-on bouncer + optimistic-echo model from the spec.

**Overlays** (built in the recommended Direction-A skin, portable to any):
- **Cmd-K palette** — scope chips (All/Channels/People/Actions/Recent), fuzzy
  match highlighting, per-result network tag + unread badge, and inline teachable
  shortcuts (`⌘J`, `⌘⇧F`, `⌘D`) on the right of each action.
- **Global search** — `in:#channel` / `from:user` as removable colored tokens,
  filter row (Messages/Files/Links/time), results shown *with surrounding context*
  (dimmed lines around the highlighted match), `<mark>` hits, permalinks, and a
  filter cheat-sheet footer (`in: from: before: after: has:`).

---

## Recommendation

**Ship Direction A — "Terminal-Modern" — as the base, and steal from the others.**

Reasoning:
1. **It wins on the core thesis.** Our wedge is beating The Lounge on density and
   speed for an IRC-literate, self-hosting audience. A is the most information-dense
   and the most IRC-authentic without looking dated. It signals "power tool" the
   moment you open it.
2. **It's the safest identity for the target user.** Community operators and their
   members skew technical; the terminal-adjacent aesthetic reads as *credible* and
   *fast*, where a highly consumer look could read as "toy."
3. **It scales cleanly to the light theme and to future custom themes** because its
   accent system is a single hue + one highlight over a neutral ramp — easy to
   reskin per the spec's custom-themes requirement.

**But borrow deliberately:**
- Take **B's warmth in the light theme** and its message-grouping calm — A's light
  mode should not be a harsh flip. B proves warm light IRC can feel premium.
- Take **C's gradient brand mark, aurora accent option, and friendly onboarding
  polish** as an optional built-in theme ("Aurora") — it's the best face to show
  Discord migrants and for marketing screenshots.

Concretely: build the token system and components once (as all three already share
structure), ship **Terminal-Modern** as default, and offer **Editorial (warm)** and
**Aurora (vibrant)** as two additional first-party themes. That directly satisfies
the spec's "dark/light + custom themes" line while giving each audience a face they
recognize.

---

## Open questions for the owner

1. **Default theme:** confirm Terminal-Modern as the out-of-box default, with
   Editorial + Aurora as bundled alternates? Or lead with a friendlier face (C) to
   widen the top of the funnel?
2. **Avatars in the message list:** A is intentionally avatar-less for density;
   B/C use gradient initial-avatars. Should avatars be a density/appearance option
   rather than baked per-theme? (Recommendation: yes — make it a toggle.)
3. **mIRC color rendering palette:** each direction remaps the 16 mIRC colors to
   its own palette for legibility. Do we want a single canonical mIRC palette
   across themes (predictable), or per-theme remaps (prettier)? Trade-off:
   consistency vs. cohesion.
4. **Member list default:** shown by default here (collapses < ~1200px). On smaller
   laptops should it be hidden by default and summoned, à la density?
5. **Compact density metrics:** are the compact numbers tight enough, or should we
   offer a third **"Ultra"** tier for the density maximalists who currently CSS-hack
   The Lounge? Low cost given the token system.
6. **Motion budget:** spec calls for "Telegram-grade motion." These static mockups
   only hint at it (hover, typing dots, palette pop). Want a short motion-spec pass
   (message enter/leave, optimistic-echo settle, channel-switch crossfade) next?
