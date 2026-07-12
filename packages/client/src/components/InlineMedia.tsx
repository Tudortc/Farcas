const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp)(?:[?#].*)?$/i

/**
 * Returns true if the URL should be rendered as an inline image.
 * Matches by image file extension or /api/media/ path.
 */
export function isImageUrl(url: string): boolean {
  if (url.startsWith('/api/media/')) return true
  return IMAGE_EXT_RE.test(url)
}

interface InlineMediaProps {
  url: string
  /** Explicit hint that this URL is an image (e.g. from MIME info). */
  isImage?: boolean
}

/**
 * Renders a bounded, lazy-loaded inline image if the URL looks like an image.
 * Renders nothing otherwise.
 */
export function InlineMedia({ url, isImage }: InlineMediaProps) {
  if (!isImage && !isImageUrl(url)) return null
  // Belt-and-suspenders: only render http/https URLs as images
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/api/media/')) return null

  return (
    <div
      style={{
        marginTop: '4px',
        maxHeight: '320px',
        overflow: 'hidden',
        borderRadius: 'var(--radius-sm)',
        display: 'inline-block',
        lineHeight: 0,
      }}
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        style={{
          maxWidth: '100%',
          maxHeight: '320px',
          display: 'block',
          borderRadius: 'var(--radius-sm)',
          objectFit: 'contain',
        }}
      />
    </div>
  )
}
