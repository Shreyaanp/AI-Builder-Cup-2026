/**
 * Validates URLs: only http, https, tel, and upi links are allowed.
 * Prevents javascript:, data:, vbscript: and other malicious schemes.
 */
export function safeUrl(rawUrl?: string | null): string {
  if (!rawUrl) return ''
  const trimmed = rawUrl.trim()
  if (/^(https?:|tel:|upi:)/i.test(trimmed)) {
    return trimmed
  }
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
    return trimmed
  }
  return ''
}

/**
 * Strips Markdown formatting so that TTS (voice synthesis) and audio captions
 * do not read aloud formatting syntax like "asterisk", "hash", "backtick", etc.
 */
export function stripMarkdown(text: string): string {
  if (!text) return ''
  let clean = text
  // Remove fenced code blocks
  clean = clean.replace(/```[\s\S]*?```/g, ' ')
  // Remove HTML tags
  clean = clean.replace(/<[^>]*>/g, '')
  // Remove inline code
  clean = clean.replace(/`([^`]+)`/g, '$1')
  // Remove images ![alt](url) -> alt
  clean = clean.replace(/!\[([^\]]*)\]\((?:[^()]+|\([^()]*\))*\)/g, '$1')
  // Remove links [text](url) -> text
  clean = clean.replace(/\[([^\]]+)\]\((?:[^()]+|\([^()]*\))*\)/g, '$1')
  // Remove headers
  clean = clean.replace(/^#{1,6}\s+/gm, '')
  // Remove blockquotes
  clean = clean.replace(/^>\s+/gm, '')
  // Remove list markers (- , * , + , 1. )
  clean = clean.replace(/^[\s]*[-*+]\s+/gm, '')
  clean = clean.replace(/^[\s]*\d+\.\s+/gm, '')
  // Remove bold and italic markers
  clean = clean.replace(/\*\*([^*]+)\*\*/g, '$1')
  clean = clean.replace(/\*([^*]+)\*/g, '$1')
  clean = clean.replace(/__([^_]+)__/g, '$1')
  clean = clean.replace(/_([^_]+)_/g, '$1')
  // Remove table separator rows e.g. |---|---|
  clean = clean.replace(/^\|?[\s-:]+\|[\s-:]+\|?$/gm, '')
  // Replace table pipe characters with space
  clean = clean.replace(/\|/g, ' ')
  // Remove horizontal rules
  clean = clean.replace(/^[-*_]{3,}\s*$/gm, '')
  // Strip any remaining formatting symbols: *, #, _, ~, `, >
  clean = clean.replace(/[*_#~`>]/g, '')
  // Collapse whitespace
  clean = clean.replace(/\s+/g, ' ').trim()
  return clean
}

/**
 * Stabilizes partial Markdown during streaming (SSE) to prevent flicker or broken half-tokens
 * (e.g. unclosed bold **, italics *, unclosed inline code `, incomplete links [label](url, etc.).
 */
export function stabilizeMarkdown(text: string): string {
  if (!text) return ''
  let result = text

  // 1. Unclosed link syntax: [label](url...
  const openBracket = (result.match(/(?<!\\)\[/g) || []).length
  const closeBracket = (result.match(/(?<!\\)\]/g) || []).length
  if (openBracket > closeBracket) {
    result += ']'
  } else {
    const lastLinkOpen = result.lastIndexOf('](')
    if (lastLinkOpen !== -1) {
      const afterLinkOpen = result.slice(lastLinkOpen + 2)
      if (!afterLinkOpen.includes(')')) {
        result += ')'
      }
    }
  }

  // 2. Unclosed code blocks ```
  const codeBlocks = (result.match(/(?<!\\)```/g) || []).length
  if (codeBlocks % 2 !== 0) {
    result += '\n```'
  } else {
    // Unclosed inline backticks
    const backticks = (result.match(/(?<!\\)`/g) || []).length
    if (backticks % 2 !== 0) {
      result += '`'
    }
  }

  // Strip code blocks temporarily when inspecting inline delimiters
  const outsideCode = result.replace(/`[^`]*`/g, '')

  // 3. Unclosed bold **
  const bolds = (outsideCode.match(/(?<!\\)\*\*/g) || []).length
  if (bolds % 2 !== 0) {
    if (result.endsWith('**')) {
      result += ' '
    }
    result += '**'
  }

  // 4. Unclosed italic * (accounting for **)
  const withoutBold = outsideCode.replace(/\*\*/g, '')
  const italics = (withoutBold.match(/(?<!\\)\*/g) || []).length
  if (italics % 2 !== 0) {
    if (result.endsWith('*')) {
      result += ' '
    }
    result += '*'
  }

  // 5. Incomplete table rows: line containing | but not ending with |
  const lines = result.split('\n')
  const lastLine = lines[lines.length - 1]
  if (lastLine && lastLine.includes('|') && !lastLine.trim().endsWith('|')) {
    result += ' |'
  }

  return result
}
