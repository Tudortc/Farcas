# Classic Terminal Themes + Light-Mode Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 14 first-party themes (existing A/B/C/Shimmer + completed A/B/C light + Solarized/Gruvbox/Dracula/Nord/Monokai classics) presented in a swatch-card picker, and finish the deferred light-mode token wiring.

**Architecture:** Themes are already CSS-variable-driven — `:root` is theme `a`, every other theme is a `[data-theme="<slug>"]` block in `tokens.css` overriding the same token contract. We add new blocks, move the theme list into a single `theme-catalog.ts` (id + label + group + swatch), widen `ThemeId`, and replace `AppearanceMenu`'s tiny-button row with grouped `ThemeSwatch` cards. A small CSS cleanup routes hardcoded dark values through tokens so light themes render correctly.

**Tech Stack:** React 19, Zustand, TypeScript (ESM, `.js` import specifiers), Vitest + @testing-library/react, plain CSS custom properties. Package: `@bool/client` (`packages/client`).

## Global Constraints

- Import specifiers use `.js` extensions even for `.ts`/`.tsx` sources (ESM/NodeNext). Copy the existing style exactly.
- `ThemeId` is the single source of truth for valid theme slugs; `applyAppearance` clears `data-theme` for `a` and sets `data-theme="<slug>"` for every other slug.
- Every theme block MUST override the full token contract: `--bg-0 --bg-1 --bg-2 --bg-3 --bg-4`, `--line --line-2`, `--ink-0 --ink-1 --ink-2 --ink-3`, `--green --green-dim --amber --amber-dim --cyan --red --violet --blue`, `--m-red --m-green --m-yellow --m-blue --m-magenta --m-cyan --m-orange`, `--on-accent --glow --glow-strong --focus`. Light themes ALSO override `--scrim` and `--shadow-overlay`.
- `--mono`, `--sans`, `--radius`, `--radius-sm` may be inherited from `:root` (themes are palette-only unless a block already customizes them, as B/C/Shimmer do).
- Run the client test suite from `packages/client`: `pnpm vitest run`. Keep the existing suite green and typecheck clean (`pnpm tsc --noEmit` or the repo's typecheck script).
- localStorage keys are unchanged: `bool.theme`, `bool.density`.

---

### Task 1: Light-mode token cleanup (route hardcoded darks through tokens)

Makes light themes render correctly by removing hardcoded near-black values from `app.css`. This is a prerequisite for the light themes in Task 5.

**Files:**
- Modify: `packages/client/src/styles/app.css` (lines ~443, ~746 dialog backdrops; ~947 amber tint; ~828-830 blue pill)
- Test: `packages/client/src/styles/css-tokens.test.ts` (create)

**Interfaces:**
- Consumes: existing tokens `--scrim`, `--amber` (defined in `tokens.css :root`).
- Produces: an `app.css` free of the forbidden hardcoded strings, asserted by the test.

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/styles/css-tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const appCss = readFileSync(fileURLToPath(new URL('./app.css', import.meta.url)), 'utf8')

describe('app.css light-mode cleanup', () => {
  it('routes dialog backdrops through --scrim (no hardcoded rgba(4, 6, 7))', () => {
    expect(appCss).not.toMatch(/rgba\(\s*4\s*,\s*6\s*,\s*7/)
  })
  it('routes the amber mention tint through a token (no hardcoded rgba(255, 180, 84))', () => {
    expect(appCss).not.toMatch(/rgba\(\s*255\s*,\s*180\s*,\s*84/)
  })
  it('routes the blue pill through tokens (no hardcoded rgba(122, 162, 247) / rgba(47, 69, 112))', () => {
    expect(appCss).not.toMatch(/rgba\(\s*122\s*,\s*162\s*,\s*247/)
    expect(appCss).not.toMatch(/rgba\(\s*47\s*,\s*69\s*,\s*112/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/styles/css-tokens.test.ts` (from `packages/client`)
Expected: FAIL — the hardcoded strings still exist.

- [ ] **Step 3: Apply the edits**

In `packages/client/src/styles/app.css`:

- Both dialog backdrops (`background: rgba(4, 6, 7, 0.68);` and `background: rgba(4, 6, 7, 0.55);`) → `background: var(--scrim);`
- The amber mention tint `background: rgba(255, 180, 84, 0.22);` → `background: color-mix(in srgb, var(--amber) 22%, transparent);`
- The blue pill:
  - `background: rgba(122, 162, 247, 0.1);` → `background: color-mix(in srgb, var(--blue) 12%, transparent);`
  - `border: 1px solid rgba(47, 69, 112, 1);` → `border: 1px solid color-mix(in srgb, var(--blue) 35%, var(--bg-2));`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/styles/css-tokens.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/styles/app.css packages/client/src/styles/css-tokens.test.ts
git commit -m "fix(client): route hardcoded darks through tokens for light-mode readiness"
```

---

### Task 2: Theme catalog + widen ThemeId + applyAppearance wiring

Move the theme list into one catalog module and widen the type to all 14 slugs.

**Files:**
- Create: `packages/client/src/theme-catalog.ts`
- Modify: `packages/client/src/theme.ts` (import `ThemeId` from the catalog; keep `Density`, store, `applyAppearance`)
- Test: `packages/client/src/theme.test.ts` (create)

**Interfaces:**
- Produces:
  - `type ThemeId = 'a' | 'a-light' | 'b' | 'b-light' | 'c' | 'c-light' | 'shimmer' | 'solarized-dark' | 'solarized-light' | 'gruvbox-dark' | 'gruvbox-light' | 'dracula' | 'nord' | 'monokai'`
  - `type ThemeGroup = 'bool' | 'classic'`
  - `interface ThemeMeta { id: ThemeId; label: string; group: ThemeGroup; light: boolean; swatch: string[] }`
  - `const THEME_CATALOG: ThemeMeta[]` (14 entries, order = display order)
  - `applyAppearance(theme: ThemeId, density: Density): void` (unchanged behavior)
- Consumes: `zustand` `create` (already used in `theme.ts`).

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/theme.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { applyAppearance } from './theme.js'
import { THEME_CATALOG } from './theme-catalog.js'

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-density')
})

describe('theme catalog', () => {
  it('has 14 themes with unique ids', () => {
    expect(THEME_CATALOG).toHaveLength(14)
    expect(new Set(THEME_CATALOG.map((t) => t.id)).size).toBe(14)
  })
  it('groups into bool and classic', () => {
    expect(THEME_CATALOG.some((t) => t.group === 'bool')).toBe(true)
    expect(THEME_CATALOG.some((t) => t.group === 'classic')).toBe(true)
  })
  it('every theme has a non-empty swatch', () => {
    for (const t of THEME_CATALOG) expect(t.swatch.length).toBeGreaterThanOrEqual(4)
  })
})

describe('applyAppearance', () => {
  it('clears data-theme for the default theme "a"', () => {
    document.documentElement.setAttribute('data-theme', 'dracula')
    applyAppearance('a', 'compact')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(document.documentElement.getAttribute('data-density')).toBe('compact')
  })
  it('sets data-theme for every non-default slug', () => {
    for (const t of THEME_CATALOG.filter((t) => t.id !== 'a')) {
      applyAppearance(t.id, 'comfortable')
      expect(document.documentElement.getAttribute('data-theme')).toBe(t.id)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/theme.test.ts`
Expected: FAIL — `theme-catalog.js` does not exist.

- [ ] **Step 3: Create the catalog**

Create `packages/client/src/theme-catalog.ts`:

```ts
export type ThemeId =
  | 'a' | 'a-light'
  | 'b' | 'b-light'
  | 'c' | 'c-light'
  | 'shimmer'
  | 'solarized-dark' | 'solarized-light'
  | 'gruvbox-dark' | 'gruvbox-light'
  | 'dracula' | 'nord' | 'monokai'

export type ThemeGroup = 'bool' | 'classic'

export interface ThemeMeta {
  id: ThemeId
  label: string
  group: ThemeGroup
  light: boolean
  /** Representative palette chips for the picker preview: [bg, surface, fg, accent, accent2]. */
  swatch: string[]
}

export const THEME_CATALOG: ThemeMeta[] = [
  // ---- bool group ----
  { id: 'a',        label: 'Terminal',     group: 'bool', light: false, swatch: ['#0a0c0d', '#151a1d', '#e6efe9', '#39e08b', '#ffb454'] },
  { id: 'a-light',  label: 'Terminal Light', group: 'bool', light: true,  swatch: ['#ffffff', '#eaeeec', '#141a18', '#0f9d58', '#c47f00'] },
  { id: 'b',        label: 'Editorial',    group: 'bool', light: false, swatch: ['#17130f', '#231d17', '#f3ece1', '#a3c48f', '#e8a76b'] },
  { id: 'b-light',  label: 'Editorial Light', group: 'bool', light: true,  swatch: ['#faf5ec', '#efe7da', '#2b2318', '#6f8f4e', '#c9793a'] },
  { id: 'c',        label: 'Aurora',       group: 'bool', light: false, swatch: ['#0b0b16', '#181733', '#f0eefe', '#a6f065', '#8b7dff'] },
  { id: 'c-light',  label: 'Aurora Light', group: 'bool', light: true,  swatch: ['#ffffff', '#eef0fb', '#16142e', '#6a5af0', '#4b9e2f'] },
  { id: 'shimmer',  label: 'Shimmer',      group: 'bool', light: false, swatch: ['#141109', '#2b251c', '#f3ead9', '#9db665', '#e08159'] },
  // ---- classic group ----
  { id: 'solarized-dark',  label: 'Solarized Dark',  group: 'classic', light: false, swatch: ['#002b36', '#073642', '#93a1a1', '#268bd2', '#859900'] },
  { id: 'solarized-light', label: 'Solarized Light', group: 'classic', light: true,  swatch: ['#fdf6e3', '#eee8d5', '#586e75', '#268bd2', '#859900'] },
  { id: 'gruvbox-dark',    label: 'Gruvbox Dark',    group: 'classic', light: false, swatch: ['#282828', '#3c3836', '#ebdbb2', '#fe8019', '#b8bb26'] },
  { id: 'gruvbox-light',   label: 'Gruvbox Light',   group: 'classic', light: true,  swatch: ['#fbf1c7', '#ebdbb2', '#3c3836', '#af3a03', '#79740e'] },
  { id: 'dracula',         label: 'Dracula',         group: 'classic', light: false, swatch: ['#282a36', '#44475a', '#f8f8f2', '#bd93f9', '#50fa7b'] },
  { id: 'nord',            label: 'Nord',            group: 'classic', light: false, swatch: ['#2e3440', '#3b4252', '#eceff4', '#88c0d0', '#a3be8c'] },
  { id: 'monokai',         label: 'Monokai',         group: 'classic', light: false, swatch: ['#272822', '#3e3d32', '#f8f8f2', '#f92672', '#a6e22e'] },
]
```

- [ ] **Step 4: Update `theme.ts` to import `ThemeId` from the catalog**

In `packages/client/src/theme.ts`, replace the local `export type ThemeId = 'a' | 'b' | 'c' | 'shimmer'` line with:

```ts
import type { ThemeId } from './theme-catalog.js'
export type { ThemeId }
```

Leave `Density`, `applyAppearance`, `readTheme`, `readDensity`, and `useAppearance` unchanged — `applyAppearance` already handles arbitrary slugs (only `a` clears the attribute).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/theme.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/theme-catalog.ts packages/client/src/theme.ts packages/client/src/theme.test.ts
git commit -m "feat(client): theme catalog + widen ThemeId to 14 slugs"
```

---

### Task 3: Token-block completeness test + classic DARK theme blocks

Add the five classic dark themes and a test that enforces the full-contract rule for every theme block.

**Files:**
- Modify: `packages/client/src/styles/tokens.css` (append blocks)
- Test: `packages/client/src/styles/css-tokens.test.ts` (extend from Task 1)

**Interfaces:**
- Consumes: `THEME_CATALOG` (Task 2) for the list of slugs to verify.
- Produces: `[data-theme="solarized-dark"|"gruvbox-dark"|"dracula"|"nord"|"monokai"]` blocks.

- [ ] **Step 1: Write the failing test (append to `css-tokens.test.ts`)**

```ts
import { THEME_CATALOG } from '../theme-catalog.js'

const tokensCss = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')

const REQUIRED = [
  '--bg-0','--bg-1','--bg-2','--bg-3','--bg-4','--line','--line-2',
  '--ink-0','--ink-1','--ink-2','--ink-3',
  '--green','--green-dim','--amber','--amber-dim','--cyan','--red','--violet','--blue',
  '--m-red','--m-green','--m-yellow','--m-blue','--m-magenta','--m-cyan','--m-orange',
  '--on-accent','--glow','--glow-strong','--focus',
]

function blockFor(slug: string): string {
  // grab from `[data-theme="slug"]` opening brace to its matching close
  const start = tokensCss.indexOf(`[data-theme="${slug}"]`)
  if (start === -1) return ''
  const open = tokensCss.indexOf('{', start)
  const close = tokensCss.indexOf('}', open)
  return tokensCss.slice(open, close)
}

describe('tokens.css theme blocks', () => {
  for (const t of THEME_CATALOG.filter((t) => t.id !== 'a')) {
    it(`defines a block for "${t.id}"`, () => {
      expect(tokensCss).toContain(`[data-theme="${t.id}"]`)
    })
    it(`"${t.id}" overrides the full token contract`, () => {
      const block = blockFor(t.id)
      for (const token of REQUIRED) expect(block, `${t.id} missing ${token}`).toContain(token)
    })
    if (t.light) {
      it(`light theme "${t.id}" defines --scrim and --shadow-overlay`, () => {
        const block = blockFor(t.id)
        expect(block).toContain('--scrim')
        expect(block).toContain('--shadow-overlay')
      })
    }
  }
})
```

Note: the existing B/C/Shimmer blocks currently do NOT set `--focus`/`--glow-strong` in some cases — Step 3 also patches those blocks to satisfy the contract (they inherit sensibly but the test enforces explicitness).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/styles/css-tokens.test.ts`
Expected: FAIL — the five classic dark blocks are missing; some existing blocks may miss `--focus`/`--glow-strong`.

- [ ] **Step 3: Append the classic dark blocks to `tokens.css`, and patch existing blocks**

First, ensure the existing `[data-theme="b"]`, `[data-theme="c"]`, `[data-theme="shimmer"]` blocks each include `--glow-strong` and `--focus` (add `--glow-strong: color-mix(in srgb, var(--green) 40%, transparent); --focus: var(--green);` if absent).

Then append:

```css
/* ---- Solarized Dark (Ethan Schoonover) ---- */
[data-theme="solarized-dark"] {
  --bg-0:#001e27; --bg-1:#002b36; --bg-2:#002b36; --bg-3:#073642; --bg-4:#0a4150;
  --line:#073642; --line-2:#0e4b5a;
  --ink-0:#93a1a1; --ink-1:#839496; --ink-2:#657b83; --ink-3:#586e75;
  --green:#859900; --green-dim:#3d4d1a; --amber:#b58900; --amber-dim:#5c4400;
  --cyan:#2aa198; --red:#dc322f; --violet:#6c71c4; --blue:#268bd2;
  --m-red:#dc322f; --m-green:#859900; --m-yellow:#b58900; --m-blue:#268bd2;
  --m-magenta:#d33682; --m-cyan:#2aa198; --m-orange:#cb4b16;
  --on-accent:#002b36;
  --glow:color-mix(in srgb, var(--blue) 12%, transparent);
  --glow-strong:color-mix(in srgb, var(--blue) 40%, transparent);
  --focus:var(--blue);
}

/* ---- Gruvbox Dark (morhetz) ---- */
[data-theme="gruvbox-dark"] {
  --bg-0:#1d2021; --bg-1:#282828; --bg-2:#282828; --bg-3:#3c3836; --bg-4:#504945;
  --line:#3c3836; --line-2:#504945;
  --ink-0:#ebdbb2; --ink-1:#d5c4a1; --ink-2:#a89984; --ink-3:#7c6f64;
  --green:#b8bb26; --green-dim:#4b5320; --amber:#fabd2f; --amber-dim:#7a5a12;
  --cyan:#8ec07c; --red:#fb4934; --violet:#d3869b; --blue:#83a598;
  --m-red:#fb4934; --m-green:#b8bb26; --m-yellow:#fabd2f; --m-blue:#83a598;
  --m-magenta:#d3869b; --m-cyan:#8ec07c; --m-orange:#fe8019;
  --on-accent:#1d2021;
  --glow:color-mix(in srgb, var(--amber) 12%, transparent);
  --glow-strong:color-mix(in srgb, var(--amber) 40%, transparent);
  --focus:#fe8019;
}

/* ---- Dracula ---- */
[data-theme="dracula"] {
  --bg-0:#21222c; --bg-1:#282a36; --bg-2:#282a36; --bg-3:#343746; --bg-4:#44475a;
  --line:#343746; --line-2:#44475a;
  --ink-0:#f8f8f2; --ink-1:#c8cae0; --ink-2:#8a8fb8; --ink-3:#6272a4;
  --green:#50fa7b; --green-dim:#1f5c33; --amber:#ffb86c; --amber-dim:#7a5220;
  --cyan:#8be9fd; --red:#ff5555; --violet:#bd93f9; --blue:#8be9fd;
  --m-red:#ff5555; --m-green:#50fa7b; --m-yellow:#f1fa8c; --m-blue:#8be9fd;
  --m-magenta:#ff79c6; --m-cyan:#8be9fd; --m-orange:#ffb86c;
  --on-accent:#282a36;
  --glow:color-mix(in srgb, var(--violet) 12%, transparent);
  --glow-strong:color-mix(in srgb, var(--violet) 40%, transparent);
  --focus:var(--violet);
}

/* ---- Nord ---- */
[data-theme="nord"] {
  --bg-0:#2b303b; --bg-1:#2e3440; --bg-2:#2e3440; --bg-3:#3b4252; --bg-4:#434c5e;
  --line:#3b4252; --line-2:#4c566a;
  --ink-0:#eceff4; --ink-1:#d8dee9; --ink-2:#7b88a1; --ink-3:#4c566a;
  --green:#a3be8c; --green-dim:#3f4a34; --amber:#ebcb8b; --amber-dim:#6b5c33;
  --cyan:#88c0d0; --red:#bf616a; --violet:#b48ead; --blue:#81a1c1;
  --m-red:#bf616a; --m-green:#a3be8c; --m-yellow:#ebcb8b; --m-blue:#81a1c1;
  --m-magenta:#b48ead; --m-cyan:#88c0d0; --m-orange:#d08770;
  --on-accent:#2e3440;
  --glow:color-mix(in srgb, var(--cyan) 12%, transparent);
  --glow-strong:color-mix(in srgb, var(--cyan) 40%, transparent);
  --focus:var(--cyan);
}

/* ---- Monokai ---- */
[data-theme="monokai"] {
  --bg-0:#1e1f1c; --bg-1:#272822; --bg-2:#272822; --bg-3:#3e3d32; --bg-4:#49483e;
  --line:#3e3d32; --line-2:#49483e;
  --ink-0:#f8f8f2; --ink-1:#cfcfc2; --ink-2:#a6a28c; --ink-3:#75715e;
  --green:#a6e22e; --green-dim:#4a5a17; --amber:#fd971f; --amber-dim:#7a4a10;
  --cyan:#66d9ef; --red:#f92672; --violet:#ae81ff; --blue:#66d9ef;
  --m-red:#f92672; --m-green:#a6e22e; --m-yellow:#e6db74; --m-blue:#66d9ef;
  --m-magenta:#ae81ff; --m-cyan:#66d9ef; --m-orange:#fd971f;
  --on-accent:#272822;
  --glow:color-mix(in srgb, var(--green) 12%, transparent);
  --glow-strong:color-mix(in srgb, var(--green) 40%, transparent);
  --focus:var(--green);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/styles/css-tokens.test.ts`
Expected: PASS for all classic-dark slugs (light-slug tests still fail until Task 5 — see note). If running the full block-contract test now flags the light slugs as missing, mark those `it` cases pending is NOT allowed; instead run only the dark subset here: `pnpm vitest run src/styles/css-tokens.test.ts -t "solarized-dark|gruvbox-dark|dracula|nord|monokai"`. The full green bar lands after Task 5.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/styles/tokens.css packages/client/src/styles/css-tokens.test.ts
git commit -m "feat(client): classic dark themes (Solarized/Gruvbox/Dracula/Nord/Monokai) + contract test"
```

---

### Task 4: Complete existing block patches — none if Task 3 covered them

(Folded into Task 3 Step 3. This placeholder task intentionally omitted — the B/C/Shimmer `--focus`/`--glow-strong` patch happens in Task 3.)

---

### Task 5: LIGHT theme blocks (A/B/C light completed + Solarized/Gruvbox light)

Add the five light themes, completing A/B/C-Light from the mockup blocks to the full contract. After this task the full `css-tokens.test.ts` suite is green.

**Files:**
- Modify: `packages/client/src/styles/tokens.css` (append blocks)
- Test: `packages/client/src/styles/css-tokens.test.ts` (already covers light slugs from Task 3)

**Interfaces:**
- Produces: `[data-theme="a-light"|"b-light"|"c-light"|"solarized-light"|"gruvbox-light"]` blocks.

- [ ] **Step 1: Run the contract test to confirm the light slugs currently fail**

Run: `pnpm vitest run src/styles/css-tokens.test.ts -t "light"`
Expected: FAIL — the five light blocks are missing.

- [ ] **Step 2: Append the light blocks to `tokens.css`**

```css
/* ---- A Light (completed from design/direction-a light block) ---- */
[data-theme="a-light"] {
  --bg-0:#f4f6f5; --bg-1:#eaeeec; --bg-2:#ffffff; --bg-3:#f2f5f4; --bg-4:#e6ece9;
  --line:#dde4e1; --line-2:#cdd6d2;
  --ink-0:#141a18; --ink-1:#41504a; --ink-2:#6d7d76; --ink-3:#a3b0aa;
  --green:#0f9d58; --green-dim:#a7e0c2; --amber:#c47f00; --amber-dim:#f0dcb0;
  --cyan:#0a8f9c; --red:#d1453b; --violet:#7c5cbf; --blue:#2b6fd6;
  --m-red:#d1453b; --m-green:#0f9d58; --m-yellow:#b07500; --m-blue:#2b6fd6;
  --m-magenta:#9a4fc4; --m-cyan:#0a8f9c; --m-orange:#c4611a;
  --on-accent:#ffffff;
  --glow:color-mix(in srgb, var(--green) 12%, transparent);
  --glow-strong:color-mix(in srgb, var(--green) 30%, transparent);
  --focus:var(--green);
  --scrim:rgba(20,26,24,0.35); --shadow-overlay:rgba(20,26,24,0.25);
}

/* ---- B Light (completed from design/direction-b light block) ---- */
[data-theme="b-light"] {
  --bg-0:#efe7da; --bg-1:#f5efe4; --bg-2:#faf5ec; --bg-3:#fffdf7; --bg-4:#f0e4cf;
  --line:#e6dccb; --line-2:#d8cbb4;
  --ink-0:#2b2318; --ink-1:#5e5344; --ink-2:#8b7d69; --ink-3:#b3a68f;
  --green:#6f8f4e; --green-dim:#cfe0b8; --amber:#c9793a; --amber-dim:#a55e22;
  --cyan:#4f8fb0; --red:#c0564f; --violet:#9a5fa8; --blue:#4f8fb0;
  --m-red:#c0564f; --m-green:#6f8f4e; --m-yellow:#b07d2a; --m-blue:#4f8fb0;
  --m-magenta:#9a5fa8; --m-cyan:#4f8fb0; --m-orange:#c9793a;
  --on-accent:#fffdf7;
  --glow:color-mix(in srgb, var(--amber) 12%, transparent);
  --glow-strong:color-mix(in srgb, var(--amber) 30%, transparent);
  --focus:var(--amber);
  --scrim:rgba(43,35,24,0.3); --shadow-overlay:rgba(43,35,24,0.2);
}

/* ---- C Light (completed from design/direction-c light block) ---- */
[data-theme="c-light"] {
  --bg-0:#eef0fb; --bg-1:#f4f5fd; --bg-2:#ffffff; --bg-3:#f2f2fc; --bg-4:#e6e5fa;
  --line:#e3e3f4; --line-2:#d2d1ee;
  --ink-0:#16142e; --ink-1:#464266; --ink-2:#75729a; --ink-3:#a5a2c4;
  --green:#4b9e2f; --green-dim:#6a5af0; --amber:#d98a00; --amber-dim:#e0574d;
  --cyan:#1b9e97; --red:#e0574d; --violet:#6a5af0; --blue:#2f8fdb;
  --m-red:#e0574d; --m-green:#4b9e2f; --m-yellow:#c07d00; --m-blue:#2f8fdb;
  --m-magenta:#6a5af0; --m-cyan:#1b9e97; --m-orange:#d9662f;
  --on-accent:#ffffff;
  --glow:color-mix(in srgb, var(--violet) 12%, transparent);
  --glow-strong:color-mix(in srgb, var(--violet) 30%, transparent);
  --focus:var(--violet);
  --scrim:rgba(22,20,46,0.35); --shadow-overlay:rgba(22,20,46,0.25);
}

/* ---- Solarized Light (Ethan Schoonover) ---- */
[data-theme="solarized-light"] {
  --bg-0:#eee8d5; --bg-1:#f5efdc; --bg-2:#fdf6e3; --bg-3:#fdf6e3; --bg-4:#e7e0cb;
  --line:#e5dfc8; --line-2:#d9d2b8;
  --ink-0:#586e75; --ink-1:#657b83; --ink-2:#839496; --ink-3:#93a1a1;
  --green:#859900; --green-dim:#c6c9a0; --amber:#b58900; --amber-dim:#e0d6a8;
  --cyan:#2aa198; --red:#dc322f; --violet:#6c71c4; --blue:#268bd2;
  --m-red:#dc322f; --m-green:#859900; --m-yellow:#b58900; --m-blue:#268bd2;
  --m-magenta:#d33682; --m-cyan:#2aa198; --m-orange:#cb4b16;
  --on-accent:#fdf6e3;
  --glow:color-mix(in srgb, var(--blue) 12%, transparent);
  --glow-strong:color-mix(in srgb, var(--blue) 30%, transparent);
  --focus:var(--blue);
  --scrim:rgba(88,110,117,0.3); --shadow-overlay:rgba(88,110,117,0.2);
}

/* ---- Gruvbox Light (morhetz) ---- */
[data-theme="gruvbox-light"] {
  --bg-0:#f9f5d7; --bg-1:#fbf1c7; --bg-2:#fbf1c7; --bg-3:#ebdbb2; --bg-4:#d5c4a1;
  --line:#ebdbb2; --line-2:#d5c4a1;
  --ink-0:#3c3836; --ink-1:#504945; --ink-2:#665c54; --ink-3:#7c6f64;
  --green:#79740e; --green-dim:#c7c98f; --amber:#b57614; --amber-dim:#e6d5a0;
  --cyan:#427b58; --red:#9d0006; --violet:#8f3f71; --blue:#076678;
  --m-red:#9d0006; --m-green:#79740e; --m-yellow:#b57614; --m-blue:#076678;
  --m-magenta:#8f3f71; --m-cyan:#427b58; --m-orange:#af3a03;
  --on-accent:#fbf1c7;
  --glow:color-mix(in srgb, var(--amber) 12%, transparent);
  --glow-strong:color-mix(in srgb, var(--amber) 30%, transparent);
  --focus:#af3a03;
  --scrim:rgba(60,56,54,0.3); --shadow-overlay:rgba(60,56,54,0.2);
}
```

- [ ] **Step 3: Run the FULL contract test to verify it passes**

Run: `pnpm vitest run src/styles/css-tokens.test.ts`
Expected: PASS — all 13 non-default slugs have blocks + full contract; all 5 light slugs define `--scrim`/`--shadow-overlay`.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/styles/tokens.css
git commit -m "feat(client): light themes (A/B/C-Light completed + Solarized/Gruvbox Light)"
```

---

### Task 6: `ThemeSwatch` component

A selectable card showing a theme's name + palette chips.

**Files:**
- Create: `packages/client/src/components/ThemeSwatch.tsx`
- Modify: `packages/client/src/styles/app.css` (append `.theme-swatch` styles)
- Test: `packages/client/src/components/ThemeSwatch.test.tsx` (create)

**Interfaces:**
- Consumes: `ThemeMeta` from `../theme-catalog.js`.
- Produces:
  - `interface ThemeSwatchProps { theme: ThemeMeta; selected: boolean; onSelect: (id: ThemeMeta['id']) => void }`
  - `function ThemeSwatch(props: ThemeSwatchProps): JSX.Element` — renders a `<button role="radio" aria-checked>` with the label and one `<span class="chip">` per swatch color.

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/components/ThemeSwatch.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeSwatch } from './ThemeSwatch.js'
import type { ThemeMeta } from '../theme-catalog.js'

const dracula: ThemeMeta = {
  id: 'dracula', label: 'Dracula', group: 'classic', light: false,
  swatch: ['#282a36', '#44475a', '#f8f8f2', '#bd93f9', '#50fa7b'],
}

describe('ThemeSwatch', () => {
  it('renders the label and one chip per swatch color', () => {
    const { container } = render(<ThemeSwatch theme={dracula} selected={false} onSelect={() => {}} />)
    expect(screen.getByText('Dracula')).toBeInTheDocument()
    expect(container.querySelectorAll('.chip')).toHaveLength(5)
  })
  it('reflects selection via aria-checked', () => {
    render(<ThemeSwatch theme={dracula} selected onSelect={() => {}} />)
    expect(screen.getByRole('radio', { name: /dracula/i })).toHaveAttribute('aria-checked', 'true')
  })
  it('calls onSelect with the theme id when clicked', () => {
    const onSelect = vi.fn()
    render(<ThemeSwatch theme={dracula} selected={false} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('radio', { name: /dracula/i }))
    expect(onSelect).toHaveBeenCalledWith('dracula')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/ThemeSwatch.test.tsx`
Expected: FAIL — `ThemeSwatch.js` does not exist.

- [ ] **Step 3: Create the component**

Create `packages/client/src/components/ThemeSwatch.tsx`:

```tsx
import type { ThemeMeta } from '../theme-catalog.js'

export interface ThemeSwatchProps {
  theme: ThemeMeta
  selected: boolean
  onSelect: (id: ThemeMeta['id']) => void
}

export function ThemeSwatch({ theme, selected, onSelect }: ThemeSwatchProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`theme-swatch${selected ? ' on' : ''}`}
      onClick={() => onSelect(theme.id)}
      title={theme.label}
    >
      <span className="chips" aria-hidden="true">
        {theme.swatch.map((c, i) => (
          <span key={i} className="chip" style={{ background: c }} />
        ))}
      </span>
      <span className="theme-swatch-label">{theme.label}</span>
    </button>
  )
}
```

- [ ] **Step 4: Add styles to `app.css`**

```css
/* ---- Theme swatch cards ---- */
.theme-swatch {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: var(--bg-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: border-color 0.12s, background 0.12s;
}
.theme-swatch:hover { border-color: var(--line-2); }
.theme-swatch.on { border-color: var(--focus); box-shadow: 0 0 0 1px var(--focus); }
.theme-swatch:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.theme-swatch .chips { display: flex; height: 18px; border-radius: 3px; overflow: hidden; }
.theme-swatch .chip { flex: 1; }
.theme-swatch-label {
  font-family: var(--mono);
  font-size: var(--meta-fs);
  color: var(--ink-1);
}
.theme-swatch.on .theme-swatch-label { color: var(--ink-0); }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/components/ThemeSwatch.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/ThemeSwatch.tsx packages/client/src/components/ThemeSwatch.test.tsx packages/client/src/styles/app.css
git commit -m "feat(client): ThemeSwatch card component"
```

---

### Task 7: Rework `AppearanceMenu` into grouped swatch cards

Replace the tiny theme-button row with two labeled groups of `ThemeSwatch` cards driven by `THEME_CATALOG`.

**Files:**
- Modify: `packages/client/src/components/AppearanceMenu.tsx`
- Modify: `packages/client/src/components/AppearanceMenu.test.tsx`
- Modify: `packages/client/src/styles/app.css` (append `.theme-grid` / group styles)

**Interfaces:**
- Consumes: `THEME_CATALOG`, `ThemeGroup` (Task 2), `ThemeSwatch` (Task 6), `useAppearance` (`theme.ts`).

- [ ] **Step 1: Update the test**

Replace the theme-related tests in `packages/client/src/components/AppearanceMenu.test.tsx` (keep the density + sign-out tests). The theme section now renders grouped cards:

```tsx
it('renders bool and Classic group headings', () => {
  render(<AppearanceMenu />)
  expect(screen.getByText(/^bool$/i)).toBeInTheDocument()
  expect(screen.getByText(/^classic$/i)).toBeInTheDocument()
})

it('renders a card for each catalog theme', () => {
  render(<AppearanceMenu />)
  expect(screen.getByRole('radio', { name: /dracula/i })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /solarized light/i })).toBeInTheDocument()
})

it('clicking a theme card sets the theme and data-theme', () => {
  render(<AppearanceMenu />)
  fireEvent.click(screen.getByRole('radio', { name: /gruvbox dark/i }))
  expect(useAppearance.getState().theme).toBe('gruvbox-dark')
  expect(document.documentElement.getAttribute('data-theme')).toBe('gruvbox-dark')
})

it('clicking the default "Terminal" theme clears data-theme', () => {
  useAppearance.setState({ theme: 'dracula', density: 'compact' })
  document.documentElement.setAttribute('data-theme', 'dracula')
  render(<AppearanceMenu />)
  fireEvent.click(screen.getByRole('radio', { name: /^terminal$/i }))
  expect(useAppearance.getState().theme).toBe('a')
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/AppearanceMenu.test.tsx`
Expected: FAIL — old markup (tiny `A/B/C` buttons) still present; group headings/cards absent.

- [ ] **Step 3: Rework the component**

Replace the theme `THEMES` constant and the theme `.appearance-row` block in `AppearanceMenu.tsx` with catalog-driven groups. The density + notifications + sign-out sections stay unchanged.

```tsx
import { useAppearance } from '../theme.js'
import type { Density } from '../theme.js'
import { THEME_CATALOG, type ThemeGroup } from '../theme-catalog.js'
import { ThemeSwatch } from './ThemeSwatch.js'
import { NotificationsToggle } from './NotificationsToggle.js'
import { signOut } from '../auth-client.js'

const DENSITIES: { id: Density; label: string }[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'comfortable', label: 'Comfortable' },
]

const GROUPS: { id: ThemeGroup; label: string }[] = [
  { id: 'bool', label: 'bool' },
  { id: 'classic', label: 'Classic' },
]

export function AppearanceMenu() {
  const theme = useAppearance((s) => s.theme)
  const density = useAppearance((s) => s.density)
  const setTheme = useAppearance((s) => s.setTheme)
  const setDensity = useAppearance((s) => s.setDensity)

  return (
    <div className="appearance-menu" aria-label="Appearance settings">
      <div className="appearance-section">
        <div className="appearance-label">Theme</div>
        {GROUPS.map((g) => (
          <div key={g.id} className="theme-group">
            <div className="theme-group-label">{g.label}</div>
            <div className="theme-grid" role="radiogroup" aria-label={`${g.label} themes`}>
              {THEME_CATALOG.filter((t) => t.group === g.id).map((t) => (
                <ThemeSwatch key={t.id} theme={t} selected={theme === t.id} onSelect={setTheme} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="appearance-section">
        <div className="appearance-label">Density</div>
        <div className="density" role="group" aria-label="Select density">
          {DENSITIES.map((d) => (
            <button
              key={d.id}
              type="button"
              className={density === d.id ? 'on' : undefined}
              onClick={() => setDensity(d.id)}
              aria-pressed={density === d.id}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="appearance-section">
        <div className="appearance-label">Notifications</div>
        <NotificationsToggle />
      </div>

      <button
        type="button"
        className="appearance-signout"
        onClick={() => void signOut()}
        style={{ marginTop: 8, width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'var(--ink-1)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, padding: '6px 8px' }}
      >
        Sign out
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Add group/grid styles to `app.css`**

```css
.theme-group { margin-bottom: 10px; }
.theme-group-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--ink-2);
  margin: 6px 0 6px;
}
.theme-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/components/AppearanceMenu.test.tsx`
Expected: PASS (theme + density + sign-out).

- [ ] **Step 6: Widen the AppearanceMenu popover if needed & commit**

If the appearance popover is too narrow for a 2-column grid, bump its width in `app.css` (the `.appearance-menu` rule) to `min-width: 260px`. Then:

```bash
git add packages/client/src/components/AppearanceMenu.tsx packages/client/src/components/AppearanceMenu.test.tsx packages/client/src/styles/app.css
git commit -m "feat(client): grouped swatch-card theme picker in AppearanceMenu"
```

---

### Task 8: Full suite + visual verification

**Files:** none (verification only). Screenshots saved to `design/shots/`.

- [ ] **Step 1: Run the full client suite + typecheck**

Run: `pnpm vitest run` and the repo typecheck (`pnpm -w tsc --noEmit` or the client's typecheck script).
Expected: all green, no type errors. Fix any fallout (e.g. other files that imported `ThemeId` from `theme.js` still work since it is re-exported).

- [ ] **Step 2: Visual-verify several themes (per the bool-visual-verify workflow)**

With the dev stack running (`:5173`), drive headless Chrome (chrome-devtools MCP): register a throwaway user, seed chat via `window.__bool.useChat.setState(...)`, then for each of `a`, `dracula`, `solarized-light`, `gruvbox-dark` call `window.__bool.useAppearance.getState().setTheme('<slug>')`, open the appearance menu, and screenshot to `design/shots/theme-<slug>.png`. Confirm: readable text-on-bg, visible focus ring, sensible mention/link colors, and that the LIGHT theme (`solarized-light`) renders light surfaces everywhere including dialogs (verifies the Task 1 `--scrim` cleanup).

- [ ] **Step 3: WCAG spot-check**

For each light theme and Solarized/Gruvbox dark, verify `--ink-0` on `--bg-2` and `--on-accent` on `--amber`/`--green` meet ≥4.5:1 (body) / ≥3:1 (large). Nudge any failing derived step in `tokens.css` and re-run Task 3/5's contract test. Commit any adjustments:

```bash
git add packages/client/src/styles/tokens.css design/shots/
git commit -m "test(client): visual + WCAG verification of theme palettes"
```

---

## Self-Review

**Spec coverage (Parts B + C of the design):**
- B1 (14 themes, two groups, flat cards, dark-only classics as single cards) → Tasks 2, 3, 5.
- B2 (full-contract token blocks, canonical accents, A/B/C-Light completed, WCAG) → Tasks 3, 5, 8.
- B3 (ThemeId union, applyAppearance unchanged, localStorage slug) → Task 2.
- B4 (ThemeSwatch, static swatch, grouped picker, aria/keyboard) → Tasks 6, 7.
- C (route hardcoded darks through tokens) → Task 1.
- Testing/verification (unit + visual + WCAG) → each task's tests + Task 8.
- **Part A (chat-UX overhaul) is intentionally NOT in this plan** — it depends on the frontend-design study and gets its own plan authored afterward, to avoid placeholder code.

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows real code; Task 4 is an intentional no-op cross-reference (folded into Task 3) rather than a placeholder.

**Type consistency:** `ThemeId`, `ThemeGroup`, `ThemeMeta`, `THEME_CATALOG`, `ThemeSwatchProps` names/shapes match across Tasks 2/6/7. `applyAppearance(theme, density)` signature unchanged. Slug strings are identical between `theme-catalog.ts`, `tokens.css` blocks, and tests.
