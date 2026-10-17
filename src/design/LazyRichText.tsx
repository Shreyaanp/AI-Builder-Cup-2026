import { lazy, Suspense } from 'react'
import type { RichTextProps } from './RichText'
import { PlainText } from './PlainText'

const Markdown = lazy(() => import('./RichText').then((m) => ({ default: m.RichText })))

/**
 * RichText whose markdown renderer (react-markdown + remark-gfm, ~165 KB) loads on demand; until it
 * arrives the same text shows unformatted.
 */
export function RichText(props: RichTextProps) {
  return (
    <Suspense
      fallback={
        <PlainText text={props.content} className={props.className} sx={props.sx} dir={props.dir} />
      }
    >
      <Markdown {...props} />
    </Suspense>
  )
}
