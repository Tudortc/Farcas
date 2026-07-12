import { describe, it, expect, vi } from 'vitest'
import { uploadFile } from './upload-client.js'

describe('uploadFile', () => {
  it('POSTs a FormData to /api/upload and returns the url on ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'abc123', url: '/api/media/abc123', mime: 'image/png' }),
    })

    const file = new File(['pixel'], 'test.png', { type: 'image/png' })
    const result = await uploadFile(file, { fetch: mockFetch as any })

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/upload')
    expect(opts.method).toBe('POST')
    expect(opts.credentials).toBe('same-origin')
    expect(opts.body).toBeInstanceOf(FormData)
    const fd = opts.body as FormData
    expect(fd.get('file')).toBe(file)
    expect(result).toBe('/api/media/abc123')
  })

  it('returns null when the response is not ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    })

    const file = new File(['pixel'], 'fail.png', { type: 'image/png' })
    const result = await uploadFile(file, { fetch: mockFetch as any })
    expect(result).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const file = new File(['pixel'], 'fail.png', { type: 'image/png' })
    const result = await uploadFile(file, { fetch: mockFetch as any })
    expect(result).toBeNull()
  })
})
