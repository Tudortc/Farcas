import { describe, it, expect, beforeAll } from 'vitest'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'
import { setReadMarker, listReadMarkers } from './read-markers.js'

beforeAll(() => ensureAppSchema(getDb()))

describe('read markers', () => {
  it('sets and lists markers per user', () => {
    setReadMarker('ru1', 1, '#a', 100)
    setReadMarker('ru1', 1, '#b', 200)
    const list = listReadMarkers('ru1')
    expect(list).toHaveLength(2)
    expect(list.find((m) => m.target === '#a')!.ts).toBe(100)
  })
  it('only moves markers forward', () => {
    setReadMarker('ru2', 1, '#a', 500)
    setReadMarker('ru2', 1, '#a', 300) // earlier — ignored
    expect(listReadMarkers('ru2')[0]!.ts).toBe(500)
    setReadMarker('ru2', 1, '#a', 700) // later — advances
    expect(listReadMarkers('ru2')[0]!.ts).toBe(700)
  })
  it('isolates users', () => {
    setReadMarker('ruA', 1, '#x', 10)
    expect(listReadMarkers('ruB')).toHaveLength(0)
  })
  it('returns effective ts and changed=true when advancing', () => {
    const result = setReadMarker('ru3', 1, '#z', 500)
    expect(result).toEqual({ ts: 500, changed: true })
    const later = setReadMarker('ru3', 1, '#z', 900)
    expect(later).toEqual({ ts: 900, changed: true })
  })
  it('returns effective ts and changed=false when stale', () => {
    setReadMarker('ru4', 1, '#z', 800)
    const stale = setReadMarker('ru4', 1, '#z', 400)
    expect(stale).toEqual({ ts: 800, changed: false })
  })
})
