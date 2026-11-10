import { Suspense, lazy, useState } from 'react'
import { IconButton } from '@mui/material'
import { X } from 'lucide-react'
import type { TodayCards } from './cardChoices'
import { useCardsCopy } from './cardsCopy'

// The reasons load on the first X tap: the first screen stays inside its budget.
const CardReasons = lazy(() => import('./CardReasons').then((m) => ({ default: m.CardReasons })))

/**
 * X on a Today card (OB-176): one tap asks why, "Not now" hides it until tomorrow and "Not
 * useful" rests that kind of card for two weeks. Saved for every phone; the card leaves at once.
 */
export function CardDismiss({
  card,
  label,
  cards,
}: {
  card: string
  /** What the card says, so a screen reader hears which card the X hides. */
  label: string
  cards: TodayCards | null | undefined
}) {
  const c = useCardsCopy()
  const [asking, setAsking] = useState(false)
  if (asking)
    return (
      <Suspense fallback={null}>
        <CardReasons card={card} cards={cards} onClose={() => setAsking(false)} />
      </Suspense>
    )
  return (
    <IconButton
      aria-label={c.hideLabel(label)}
      data-uncounted
      onClick={() => setAsking(true)}
      sx={{ width: 48, height: 48, flexShrink: 0, mr: -2 }}
    >
      <X size={18} />
    </IconButton>
  )
}
