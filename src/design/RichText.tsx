import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Box, Link, Typography, useTheme } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import { safeUrl, stabilizeMarkdown } from './markdownUtils'

export interface RichTextProps {
  content?: string
  /** If streaming, auto-closes incomplete Markdown delimiters to prevent layout shifts */
  streaming?: boolean
  className?: string
  sx?: SxProps<Theme>
  /** Force text direction if needed ('auto' by default for RTL/Indic safety) */
  dir?: 'auto' | 'ltr' | 'rtl'
}

/**
 * Shared, safe RichText component powered by react-markdown + remark-gfm.
 * - No raw HTML
 * - Safe links only (http, https, tel, upi) with rel="noopener noreferrer"
 * - Scaled down for chat bubbles
 * - Tables scroll horizontally inside bubble at 360px
 * - RTL/Indic safe
 */
export function RichText({
  content = '',
  streaming = false,
  className,
  sx,
  dir = 'auto',
}: RichTextProps) {
  const theme = useTheme()
  const roles = theme.material

  const processedContent = useMemo(() => {
    return streaming ? stabilizeMarkdown(content) : content
  }, [content, streaming])

  return (
    <Box
      className={className}
      dir={dir}
      sx={{
        direction: dir === 'auto' ? undefined : dir,
        unicodeBidi: 'plaintext',
        textAlign: 'start',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
        lineHeight: 1.5,
        ...sx,
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrl}
        components={{
          // Paragraphs
          p: ({ children }) => (
            <Typography
              variant="bodyLarge"
              component="p"
              sx={{
                my: 0.5,
                '&:first-of-type': { mt: 0 },
                '&:last-of-type': { mb: 0 },
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
            >
              {children}
            </Typography>
          ),
          // Headings scaled down for mobile chat bubbles
          h1: ({ children }) => (
            <Typography
              variant="titleMedium"
              component="h1"
              sx={{
                fontWeight: 700,
                fontSize: '1.125rem',
                mt: 1.25,
                mb: 0.5,
                '&:first-of-type': { mt: 0 },
                lineHeight: 1.3,
              }}
            >
              {children}
            </Typography>
          ),
          h2: ({ children }) => (
            <Typography
              variant="titleSmall"
              component="h2"
              sx={{
                fontWeight: 700,
                fontSize: '1.05rem',
                mt: 1,
                mb: 0.5,
                '&:first-of-type': { mt: 0 },
                lineHeight: 1.3,
              }}
            >
              {children}
            </Typography>
          ),
          h3: ({ children }) => (
            <Typography
              variant="labelLarge"
              component="h3"
              sx={{
                fontWeight: 700,
                fontSize: '1rem',
                mt: 0.75,
                mb: 0.25,
                '&:first-of-type': { mt: 0 },
                lineHeight: 1.3,
              }}
            >
              {children}
            </Typography>
          ),
          h4: ({ children }) => (
            <Typography
              variant="labelLarge"
              component="h4"
              sx={{
                fontWeight: 700,
                fontSize: '0.95rem',
                mt: 0.5,
                mb: 0.25,
                '&:first-of-type': { mt: 0 },
                lineHeight: 1.3,
              }}
            >
              {children}
            </Typography>
          ),
          // Lists
          ul: ({ children }) => (
            <Box
              component="ul"
              sx={{
                m: 0,
                my: 0.5,
                pl: 2.5,
                listStyleType: 'disc',
                '& li': { my: 0.25 },
              }}
            >
              {children}
            </Box>
          ),
          ol: ({ children }) => (
            <Box
              component="ol"
              sx={{
                m: 0,
                my: 0.5,
                pl: 2.5,
                listStyleType: 'decimal',
                '& li': { my: 0.25 },
              }}
            >
              {children}
            </Box>
          ),
          li: ({ children }) => (
            <Typography
              component="li"
              variant="bodyLarge"
              sx={{
                lineHeight: 1.5,
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
            >
              {children}
            </Typography>
          ),
          // Bold and italic
          strong: ({ children }) => (
            <Box component="strong" sx={{ fontWeight: 700 }}>
              {children}
            </Box>
          ),
          em: ({ children }) => (
            <Box component="em" sx={{ fontStyle: 'italic' }}>
              {children}
            </Box>
          ),
          // Inline and block code
          code: ({ children, ...props }) => (
            <Box
              component="code"
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.875em',
                bgcolor: roles ? roles.surfaceContainerHighest : 'action.hover',
                px: 0.6,
                py: 0.2,
                borderRadius: '4px',
                overflowWrap: 'anywhere',
              }}
              {...props}
            >
              {children}
            </Box>
          ),
          pre: ({ children }) => (
            <Box
              component="pre"
              sx={{
                overflowX: 'auto',
                maxWidth: '100%',
                p: 1.5,
                my: 1,
                borderRadius: '8px',
                bgcolor: roles ? roles.surfaceContainerHighest : 'action.hover',
                fontSize: '0.875rem',
                lineHeight: 1.4,
              }}
            >
              {children}
            </Box>
          ),
          // Links: only safe schemes with rel="noopener noreferrer"
          a: ({ href, children, ...props }) => {
            const safe = safeUrl(href)
            if (!safe) return <span>{children}</span>
            const isExternal = safe.startsWith('http:') || safe.startsWith('https:')
            return (
              <Link
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
                {...props}
              >
                {children}
              </Link>
            )
          },
          // Tables scroll horizontally inside bubble at 360px
          table: ({ children }) => (
            <Box
              sx={{
                maxWidth: '100%',
                overflowX: 'auto',
                my: 1,
                WebkitOverflowScrolling: 'touch',
                display: 'block',
              }}
            >
              <Box
                component="table"
                sx={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.875rem',
                  textAlign: 'start',
                  '& th, & td': {
                    border: '1px solid',
                    borderColor: roles ? roles.outlineVariant : 'divider',
                    px: 1.5,
                    py: 0.75,
                    fontVariantNumeric: 'tabular-nums',
                  },
                  '& th': {
                    fontWeight: 700,
                    bgcolor: roles ? roles.surfaceContainerHigh : 'action.hover',
                  },
                }}
              >
                {children}
              </Box>
            </Box>
          ),
          blockquote: ({ children }) => (
            <Box
              component="blockquote"
              sx={{
                m: 0,
                my: 1,
                pl: 2,
                borderLeft: '3px solid',
                borderColor: roles ? roles.primary : 'primary.main',
                color: roles ? roles.onSurfaceVariant : 'text.secondary',
                fontStyle: 'italic',
              }}
            >
              {children}
            </Box>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </Box>
  )
}

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
