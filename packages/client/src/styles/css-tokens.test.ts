import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { THEME_CATALOG } from '../theme-catalog.js'

const __dirname = dirname(new URL(import.meta.url).pathname)
const appCss = readFileSync(join(__dirname, 'app.css'), 'utf8')
const tokensCss = readFileSync(join(__dirname, 'tokens.css'), 'utf8')

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
