import { useCallback, useContext, useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Box, ButtonBase, Collapse, Typography, useTheme } from '@mui/material'
import { visuallyHidden } from '@mui/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { shape, type MaterialRoles } from '../../design/theme'
import { GroupContext, TileLayoutContext, useInGroup } from './growLayout'

const pressable = (roles: MaterialRoles) =>
  ({
    color: roles.onSurface,
    '&:hover': { bgcolor: roles.surfaceContainerHigh },
    '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: -3 },
  }) as const

/** A Tile drawn as a Grow row (icon, name, one status line, ›) or a More tools icon. */
export function ListTile({
  layout,
  icon,
  label,
  value,
  onClick,
  tour,
  alert = false,
  badge,
  children,
}: {
  layout: 'row' | 'tool'
  icon: ReactNode
  label: string
  value: ReactNode
  /** The tile's supporting lines: shown on a row inside an opened group, not on the list. */
  children?: ReactNode
  onClick: () => void
  tour?: string
  alert?: boolean
  /** A short live state on a More tools icon ("Live" for a running leftover deal, OB-254). */
  badge?: string
}) {
  const roles = useTheme().material
  const inGroup = useContext(GroupContext) !== null
  useInGroup(label, !alert)
  if (layout === 'tool')
    return (
      <ButtonBase
        onClick={onClick}
        data-tour={tour}
        sx={{
          flexDirection: 'column',
          justifyContent: 'flex-start',
          gap: 2,
          minWidth: 0,
          minHeight: 48,
          py: 2,
          px: 1,
          borderRadius: `${shape.lg}px`,
          textAlign: 'center',
          ...pressable(roles),
        }}
      >
        <Box
          component="span"
          aria-hidden="true"
          sx={{
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
            width: 48,
            height: 48,
            borderRadius: `${shape.lg}px`,
            bgcolor: roles.surfaceContainer,
            color: roles.primary,
          }}
        >
          {icon}
          {badge && (
            <Box
              component="span"
              data-testid="tool-badge"
              sx={{
                position: 'absolute',
                top: -8,
                insetInlineEnd: -12,
                px: 1,
                borderRadius: `${shape.full}px`,
                bgcolor: roles.primary,
                color: roles.onPrimary,
                typography: 'labelMedium',
                lineHeight: '20px',
                whiteSpace: 'nowrap',
              }}
            >
              {badge}
            </Box>
          )}
        </Box>
        <Typography component="span" variant="bodySmall" sx={{ overflowWrap: 'anywhere' }}>
          {label}
        </Typography>
        {/* The live status stays in the name for screen readers; the grid shows names only. */}
        <Box component="span" sx={visuallyHidden}>
          {value}
          {children}
        </Box>
      </ButtonBase>
    )
  return (
    <ButtonBase
      onClick={onClick}
      data-tour={tour}
      sx={{
        width: '100%',
        minHeight: 56,
        px: 4,
        py: 2,
        gap: 3,
        justifyContent: 'flex-start',
        textAlign: 'start',
        ...pressable(roles),
      }}
    >
      <Box component="span" aria-hidden="true" sx={{ display: 'flex', color: roles.primary }}>
        {icon}
      </Box>
      <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          component="span"
          variant="bodyLarge"
          sx={{ display: 'block', overflowWrap: 'anywhere' }}
        >
          {label}
        </Typography>
        <Typography
          component="span"
          variant="bodySmall"
          color="text.secondary"
          sx={{ display: 'block', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
        </Typography>
        {inGroup && children}
      </Box>
      <ChevronRight size={18} aria-hidden="true" color={roles.onSurfaceVariant} />
    </ButtonBase>
  )
}

/** Grow's rows in one rounded surface, a hairline between them. */
export function GrowRows({ children }: { children: ReactNode }) {
  const roles = useTheme().material
  return (
    <Box
      data-testid="grow-tiles"
      sx={{
        bgcolor: roles.surfaceContainerLow,
        borderRadius: `${shape.lg}px`,
        overflow: 'hidden',
        '& > :not([hidden]) ~ :not([hidden])': { borderTop: `1px solid ${roles.outlineVariant}` },
      }}
    >
      <TileLayoutContext.Provider value="row">{children}</TileLayoutContext.Provider>
    </Box>
  )
}

/**
 * One row that opens on the same screen to the tools it groups, each still under its own name
 * (2 taps). The row names the tools it holds, or shows `hint`; with none shown it hides.
 */
export function GrowGroup({
  icon,
  label,
  hint,
  items,
}: {
  icon: ReactNode
  label: string
  hint?: string
  items: ReactNode[]
}) {
  const roles = useTheme().material
  const [open, setOpen] = useState(false)
  // What each item shows, by its place in `items` (an item can draw more than one tool).
  const [names, setNames] = useState<Record<number, string[]>>({})
  const seen = useCallback((index: number, name: string) => {
    setNames((all) => ({ ...all, [index]: [...(all[index] ?? []), name] }))
    return () =>
      setNames((all) => {
        const left = [...(all[index] ?? [])]
        const at = left.indexOf(name)
        if (at < 0) return all
        left.splice(at, 1)
        return { ...all, [index]: left }
      })
  }, [])
  const slots = useMemo(
    () => items.map((_, index) => (name: string) => seen(index, name)),
    [items.length, seen], // eslint-disable-line react-hooks/exhaustive-deps -- one slot per item
  )
  const shown = Object.keys(names)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((index) => names[index]!)
  const region = useId()
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <Box hidden={shown.length === 0}>
      <ButtonBase
        data-grow-group
        aria-expanded={open}
        aria-controls={region}
        onClick={() => setOpen((value) => !value)}
        sx={{
          width: '100%',
          minHeight: 56,
          px: 4,
          py: 2,
          gap: 3,
          justifyContent: 'flex-start',
          textAlign: 'start',
          ...pressable(roles),
        }}
      >
        <Box component="span" aria-hidden="true" sx={{ display: 'flex', color: roles.primary }}>
          {icon}
        </Box>
        <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component="span"
            variant="bodyLarge"
            sx={{ display: 'block', overflowWrap: 'anywhere' }}
          >
            {label}
          </Typography>
          <Typography
            component="span"
            variant="bodySmall"
            color="text.secondary"
            sx={{ display: 'block', overflowWrap: 'anywhere' }}
          >
            {hint ?? shown.join(' · ')}
          </Typography>
        </Box>
        <Chevron size={18} aria-hidden="true" color={roles.onSurfaceVariant} />
      </ButtonBase>
      <Collapse in={open} id={region}>
        <Box
          role="group"
          aria-label={label}
          sx={{
            pl: 4,
            '& > * + *': { borderTop: `1px solid ${roles.outlineVariant}` },
            borderTop: `1px solid ${roles.outlineVariant}`,
          }}
        >
          {items.map((item, index) => (
            <GroupContext.Provider key={index} value={slots[index]!}>
              {item}
            </GroupContext.Provider>
          ))}
        </Box>
      </Collapse>
    </Box>
  )
}

/** The weekly tools as a 4-across grid of named icons, always visible under Grow's rows. */
export function MoreTools({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <Box component="section" aria-labelledby={id} data-testid="grow-more-tools">
      <Typography id={id} component="h2" variant="titleSmall" color="text.secondary" sx={{ mb: 2 }}>
        {title}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1 }}>
        <TileLayoutContext.Provider value="tool">{children}</TileLayoutContext.Provider>
      </Box>
    </Box>
  )
}
