export interface UploadDeps {
  fetch: typeof globalThis.fetch
}

export interface UploadResult {
  id: string
  url: string
  mime: string
}

/**
 * Upload a file to /api/upload using multipart FormData.
 * Returns the media URL string on success, or null on failure.
 * The `deps` parameter is injectable for testing.
 */
export async function uploadFile(
  file: File,
  deps: UploadDeps = { fetch: globalThis.fetch },
): Promise<string | null> {
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await deps.fetch('/api/upload', {
      method: 'POST',
      credentials: 'same-origin',
      body: fd,
    })
    if (!res.ok) return null
    const data = (await res.json()) as UploadResult
    return data.url
  } catch {
    return null
  }
}
