import React, { useMemo } from 'react'
import { Link, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import { safeUrl } from './markdownUtils'

const AUTO_LINK_REGEX = /(https?:\/\/[^\s<]+|tel:[^\s<]+|upi:\/\/[^\s<]+)/gi

/**
 * Plain text renderer for human-typed chat messages (owner ↔ customer).
 * Renders text strictly as plain text (no Markdown formatting or HTML injection)
 * while safely auto-linking URLs, tel:, and upi: links.
 */
export function PlainText({
  text = '',
  className,
  sx,
  dir = 'auto',
}: {
  text?: string
  className?: string
  sx?: SxProps<Theme>
  dir?: 'auto' | 'ltr' | 'rtl'
}) {
  const elements = useMemo(() => {
    if (!text) return null
    const parts = text.split(AUTO_LINK_REGEX)
    return parts.map((part, index) => {
      if (part.match(AUTO_LINK_REGEX)) {
        const safe = safeUrl(part)
        if (safe) {
          const isExternal = safe.startsWith('http:') || safe.startsWith('https:')
          return (
            <Link
              key={index}
              href={safe}
              target={isExternal ? '_blank' : undefined}
              rel={isExternal ? 'noopener noreferrer' : undefined}
              sx={{
                color: 'inherit',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
                fontWeight: 500,
                wordBreak: 'break-word',
                '&:hover': { opacity: 0.8 },
              }}
            >
              {part}
            </Link>
          )
        }
      }
      return <React.Fragment key={index}>{part}</React.Fragment>
    })
  }, [text])

  return (
    <Typography
      variant="bodyLarge"
      className={className}
      dir={dir}
      sx={{
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
        lineHeight: 1.5,
        ...sx,
      }}
    >
      {elements}
    </Typography>
  )
}
