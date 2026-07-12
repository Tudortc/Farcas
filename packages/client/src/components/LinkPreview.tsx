import type { PreviewResult } from '../store/types.js'

interface LinkPreviewProps {
  preview: PreviewResult | null | undefined
}

/**
 * Renders a compact link preview card for a stored ok preview result.
 * The entire card is an anchor pointing to the original URL.
 * Renders nothing if no preview is provided.
 */
export function LinkPreview({ preview }: LinkPreviewProps) {
  if (!preview) return null

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        gap: '10px',
        marginTop: '6px',
        padding: '10px 12px',
        background: 'var(--bg-3)',
        border: '1px solid var(--line)',
        borderLeft: '3px solid var(--green)',
        borderRadius: 'var(--radius-sm)',
        textDecoration: 'none',
        color: 'var(--ink-0)',
        maxWidth: '480px',
        overflow: 'hidden',
      }}
    >
      {preview.image && /^https?:\/\//i.test(preview.image) && (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          style={{
            width: '64px',
            height: '64px',
            objectFit: 'cover',
            borderRadius: 'var(--radius-sm)',
            flexShrink: 0,
          }}
        />
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        {preview.siteName && (
          <span
            style={{
              fontSize: 'var(--meta-fs)',
              color: 'var(--green)',
              fontFamily: 'var(--mono)',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {preview.siteName}
          </span>
        )}
        {preview.title && (
          <span
            style={{
              fontSize: 'var(--msg-fs)',
              fontWeight: 600,
              color: 'var(--ink-0)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {preview.title}
          </span>
        )}
        {preview.description && (
          <span
            style={{
              fontSize: 'var(--meta-fs)',
              color: 'var(--ink-1)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {preview.description}
          </span>
        )}
      </div>
    </a>
  )
}
