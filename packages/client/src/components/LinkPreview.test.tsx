import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LinkPreview } from './LinkPreview.js'
import { InlineMedia } from './InlineMedia.js'

describe('LinkPreview', () => {
  const okPreview = {
    type: 'preview:result' as const,
    url: 'https://example.com/article',
    ok: true as const,
    title: 'Example Article',
    description: 'A really interesting article about stuff.',
    siteName: 'Example Site',
    image: 'https://example.com/og-image.png',
  }

  it('renders the title inside an anchor pointing to the url', () => {
    render(<LinkPreview preview={okPreview} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://example.com/article')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText('Example Article')).toBeInTheDocument()
  })

  it('renders the description when present', () => {
    render(<LinkPreview preview={okPreview} />)
    expect(screen.getByText('A really interesting article about stuff.')).toBeInTheDocument()
  })

  it('renders the site name when present', () => {
    render(<LinkPreview preview={okPreview} />)
    expect(screen.getByText('Example Site')).toBeInTheDocument()
  })

  it('renders the preview image when present', () => {
    const { container } = render(<LinkPreview preview={okPreview} />)
    // alt="" makes role "presentation" (decorative); use querySelector to find it
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', 'https://example.com/og-image.png')
  })

  it('renders nothing when preview is null', () => {
    const { container } = render(<LinkPreview preview={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders without optional fields (no description, no image, no siteName)', () => {
    const minimal = {
      type: 'preview:result' as const,
      url: 'https://minimal.com/',
      ok: true as const,
      title: 'Minimal Page',
    }
    render(<LinkPreview preview={minimal} />)
    expect(screen.getByText('Minimal Page')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('does not render an <img> when preview.image is a data: URL', () => {
    const withDataImage = {
      type: 'preview:result' as const,
      url: 'https://example.com/',
      ok: true as const,
      title: 'Data Image Page',
      image: 'data:image/png;base64,abc123',
    }
    const { container } = render(<LinkPreview preview={withDataImage} />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('does not render an <img> when preview.image is a javascript: URL', () => {
    const withJsImage = {
      type: 'preview:result' as const,
      url: 'https://example.com/',
      ok: true as const,
      title: 'JS Image Page',
      image: 'javascript:alert(1)',
    }
    const { container } = render(<LinkPreview preview={withJsImage} />)
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('InlineMedia', () => {
  // Note: alt="" makes the img role "presentation" (decorative). Use container.querySelector to find it.
  it('renders an img when the url has an image extension', () => {
    const { container } = render(<InlineMedia url="https://example.com/photo.jpg" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg')
  })

  it('renders an img for .png extension', () => {
    const { container } = render(<InlineMedia url="https://example.com/banner.png" />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/banner.png')
  })

  it('renders an img for .gif extension', () => {
    const { container } = render(<InlineMedia url="https://example.com/anim.gif" />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/anim.gif')
  })

  it('renders an img for .webp extension', () => {
    const { container } = render(<InlineMedia url="https://example.com/modern.webp" />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/modern.webp')
  })

  it('renders an img for /api/media/ urls', () => {
    const { container } = render(<InlineMedia url="/api/media/abc123" />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/media/abc123')
  })

  it('renders an img when isImage hint is passed', () => {
    const { container } = render(<InlineMedia url="https://cdn.example.com/img?id=42" isImage />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/img?id=42')
  })

  it('renders nothing for a non-image url without isImage hint', () => {
    const { container } = render(<InlineMedia url="https://example.com/" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for a plain text url', () => {
    const { container } = render(<InlineMedia url="https://news.ycombinator.com" />)
    expect(container.firstChild).toBeNull()
  })

  it('has loading=lazy on the rendered img', () => {
    const { container } = render(<InlineMedia url="https://example.com/pic.jpeg" />)
    expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy')
  })
})
