import { describe, it, expect } from 'vitest'

describe('toolchain smoke', () => {
  it('runs vitest and basic TS', () => {
    const doubled = [1, 2, 3].map((n) => n * 2)
    expect(doubled).toEqual([2, 4, 6])
  })
})
