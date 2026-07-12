/**
 * Tests for notify.ts — electron-free pure helpers.
 */
import { describe, it, expect } from 'vitest'
import { buildNotification, shouldNotify } from './notify'

describe('buildNotification', () => {
  it('keeps title and body when both are short', () => {
    const result = buildNotification({ title: 'Alice', body: 'Hello!' })
    expect(result.title).toBe('Alice')
    expect(result.body).toBe('Hello!')
  })

  it('truncates body longer than 200 chars', () => {
    const longBody = 'x'.repeat(250)
    const result = buildNotification({ title: 'Test', body: longBody })
    expect(result.body.length).toBeLessThanOrEqual(203) // 200 + '...'
    expect(result.body.endsWith('...')).toBe(true)
  })

  it('truncates title longer than 80 chars', () => {
    const longTitle = 'T'.repeat(100)
    const result = buildNotification({ title: longTitle, body: 'Hi' })
    expect(result.title.length).toBeLessThanOrEqual(83) // 80 + '...'
    expect(result.title.endsWith('...')).toBe(true)
  })

  it('uses default title "bool" when title is missing', () => {
    const result = buildNotification({ title: undefined as unknown as string, body: 'msg' })
    expect(result.title).toBe('bool')
  })

  it('uses default title "bool" when title is empty string', () => {
    const result = buildNotification({ title: '', body: 'msg' })
    expect(result.title).toBe('bool')
  })

  it('uses empty string for body when body is missing', () => {
    const result = buildNotification({ title: 'Test', body: undefined as unknown as string })
    expect(result.body).toBe('')
  })

  it('uses empty string for body when body is empty string', () => {
    const result = buildNotification({ title: 'Test', body: '' })
    expect(result.body).toBe('')
  })

  it('handles tag and data fields without error', () => {
    const result = buildNotification({
      title: 'Mention',
      body: 'You were mentioned',
      tag: 'mention-42',
      data: { networkId: 'net1', target: '#general' },
    })
    expect(result.title).toBe('Mention')
    expect(result.body).toBe('You were mentioned')
  })
})

describe('shouldNotify', () => {
  it('returns false when the window is focused', () => {
    expect(shouldNotify({ focused: true })).toBe(false)
  })

  it('returns true when the window is not focused', () => {
    expect(shouldNotify({ focused: false })).toBe(true)
  })
})
