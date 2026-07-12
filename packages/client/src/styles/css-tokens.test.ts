import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dirname } from 'node:path'

const __dirname = dirname(new URL(import.meta.url).pathname)
const appCss = readFileSync(join(__dirname, 'app.css'), 'utf8')

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
