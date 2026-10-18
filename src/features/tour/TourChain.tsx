import type { ReactNode } from 'react'
import { Box, Chip, Skeleton, Stack, Typography, useTheme } from '@mui/material'
import { ArrowRight, CircleCheck, FileSpreadsheet, MessageCircle, Stamp } from 'lucide-react'
import { shape } from '../../design/theme'
import { useLocale } from '../../state/hooks'
import { useIoCopy } from '../supply/ioCopy'
import { dayLabel } from '../supply/supplyData'
import { TodaySupply } from '../supply/TodaySupply'
import { formatPrice } from '../v1/format'
import { chainCopy } from './chainCopy'
import type { ChainCopy } from './chainCopy'
import type { ChainLine, ChainOrder, ChainState, ChainStory } from './chainData'
import { amount } from './chainSteps'
import { TourPanel } from './TourFeatures'

function Card({ children, label }: { children: ReactNode; label: string }) {
  const roles = useTheme().material
  return (
    <Stack
      component="section"
      aria-label={label}
      spacing={1.5}
      sx={{ p: 3, borderRadius: `${shape.lg}px`, bgcolor: roles.surfaceContainerLow }}
    >
      {children}
    </Stack>
  )
}

function Lines({ lines, currency }: { lines: ChainLine[]; currency: string }) {
  const locale = useLocale()
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1 }}>
      {lines.slice(0, 5).map((line) => (
        <Stack
          component="li"
          key={line.item}
          direction="row"
          sx={{ justifyContent: 'space-between', gap: 2 }}
        >
          <Typography variant="bodyLarge">{line.item}</Typography>
          <Typography variant="bodyLarge" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {amount(line.quantity, line.unit, locale)}
            {line.total != null && ` · ${formatPrice(line.total, currency, locale)}`}
          </Typography>
        </Stack>
      ))}
    </Box>
  )
}

function Total({ order, c }: { order: ChainOrder; c: ChainCopy }) {
  const locale = useLocale()
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Typography variant="titleSmall">{c.total}</Typography>
      <Typography variant="titleLarge" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatPrice(order.total, order.currency, locale)}
      </Typography>
    </Stack>
  )
}

function Big({ value, label }: { value: string; label: string }) {
  return (
    <Box sx={{ flex: 1 }}>
      <Typography variant="headlineMedium" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      <Typography variant="bodyMedium" color="text.secondary">
        {label}
      </Typography>
    </Box>
  )
}

function Panel({ index, story, c }: { index: number; story: ChainStory; c: ChainCopy }) {
  const locale = useLocale()
  const io = useIoCopy()
  const roles = useTheme().material
  const day = (iso: string) => dayLabel(iso, locale)
  const { order, wholesaler, chain, today } = story
  if (index === 0)
    return (
      <Stack spacing={2}>
        <TodaySupply />
        <Card label={c.forecast}>
          <Typography variant="titleSmall">{c.forecast}</Typography>
          <Stack direction="row" spacing={2}>
            <Big value={amount(today.stock, today.unit, locale)} label={c.left} />
            <Big value={amount(today.daily, today.unit, locale)} label={c.perDay} />
          </Stack>
        </Card>
      </Stack>
    )
  if (index === 1)
    return (
      <Card label={c.to(order.partner)}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <MessageCircle size={20} aria-hidden="true" />
          <Typography variant="titleMedium" component="h2">
            {c.to(order.partner)}
          </Typography>
        </Stack>
        <Chip label={c.whatsapp} size="small" sx={{ alignSelf: 'flex-start' }} />
        <Typography
          data-testid="tour-whatsapp"
          variant="bodyLarge"
          sx={{
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            p: 2,
            borderRadius: `${shape.md}px`,
            bgcolor: roles.secondaryContainer,
            color: roles.onSecondaryContainer,
          }}
        >
          {order.message}
        </Typography>
        <Total order={order} c={c} />
      </Card>
    )
  if (index === 2)
    return (
      <Stack spacing={2}>
        <Typography variant="headlineSmall" component="h2">
          {wholesaler.name}
        </Typography>
        {wholesaler.inbound && (
          <Card label={c.incoming}>
            <Chip label={c.incoming} size="small" sx={{ alignSelf: 'flex-start' }} />
            <Typography variant="titleMedium">
              {c.from(wholesaler.inbound.partner)} · {wholesaler.inbound.number}
            </Typography>
            <Typography variant="bodyLarge" color="text.secondary">
              {c.sameItems(wholesaler.inbound.lines.length)}
            </Typography>
            <Total order={wholesaler.inbound} c={c} />
          </Card>
        )}
        {wholesaler.restock && (
          <Card label={c.ownOrder}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <FileSpreadsheet size={20} aria-hidden="true" />
              <Typography variant="titleSmall">{c.spreadsheet}</Typography>
            </Stack>
            <Typography variant="titleMedium">
              {c.to(wholesaler.restock.partner)} · {wholesaler.restock.number}
            </Typography>
            <Lines lines={wholesaler.restock.lines} currency={wholesaler.restock.currency} />
            <Total order={wholesaler.restock} c={c} />
          </Card>
        )}
      </Stack>
    )
  if (index === 3)
    return chain ? (
      <Stack spacing={2}>
        <Box>
          <Typography variant="headlineSmall" component="h2">
            {chain.name}
          </Typography>
          <Typography variant="bodyLarge" color="text.secondary">
            {c.outlets(chain.outlets)} · {c.orderTo(chain.order.number, chain.order.partner)}
          </Typography>
        </Box>
        <Card label={c.sap}>
          <Box
            component="ol"
            aria-label={c.sap}
            sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 2 }}
          >
            {chain.order.documents.map((kind, i) => (
              <Stack component="li" key={kind} direction="row" spacing={2}>
                <Box sx={{ color: roles.primary, pt: 0.25 }}>
                  <CircleCheck size={20} aria-hidden="true" />
                </Box>
                <Box>
                  <Typography variant="bodyLarge">
                    {io.kind[kind as keyof typeof io.kind] ?? kind}
                  </Typography>
                  {chain.order.idocs[i] !== kind && (
                    <Typography variant="bodySmall" color="text.secondary">
                      {c.sap} {chain.order.idocs[i]}
                    </Typography>
                  )}
                </Box>
              </Stack>
            ))}
          </Box>
        </Card>
        <Card label={c.total}>
          <Lines lines={chain.order.lines} currency={chain.order.currency} />
          <Total order={chain.order} c={c} />
        </Card>
      </Stack>
    ) : (
      <Typography role="status">{c.failed}</Typography>
    )
  if (index === 4)
    return (
      <Stack spacing={2}>
        <Typography variant="headlineSmall" component="h2">
          {c.from(order.partner)} · {order.number}
        </Typography>
        {story.arrived.map((row) => (
          <Card key={row.item} label={row.item}>
            <Typography variant="titleMedium">{row.item}</Typography>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Typography variant="headlineMedium" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {amount(row.before, row.unit, locale)}
              </Typography>
              <ArrowRight size={24} aria-hidden="true" />
              <Typography
                variant="headlineMedium"
                sx={{ fontVariantNumeric: 'tabular-nums', color: roles.primary }}
              >
                {amount(row.after, row.unit, locale)}
              </Typography>
            </Stack>
            <Typography variant="bodyLarge" color="text.secondary">
              {c.runsOut(day(row.runs_out_before))} →{' '}
              {row.runs_out_after ? day(row.runs_out_after) : c.covered(day(row.covered_until))}
            </Typography>
          </Card>
        ))}
        <Card label={c.total}>
          <Lines lines={order.lines} currency={order.currency} />
          <Typography variant="bodySmall" color="text.secondary">
            {c.demo}
          </Typography>
        </Card>
      </Stack>
    )
  const people = story.customers
  return (
    <Stack spacing={2}>
      <Typography variant="headlineSmall" component="h2">
        {story.shop}
      </Typography>
      <Card label={c.stampsToday}>
        <Stack direction="row" spacing={2}>
          <Big value={String(people.stamps_today ?? 0)} label={c.stampsToday} />
          <Big value={String(people.returning_today ?? 0)} label={c.cameBack} />
        </Stack>
      </Card>
      <Card label={c.stampCard(people.stamps_needed, people.reward)}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Stamp size={20} aria-hidden="true" />
          <Typography variant="titleMedium">
            {c.stampCard(people.stamps_needed, people.reward)}
          </Typography>
        </Stack>
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }} aria-hidden="true">
          {Array.from({ length: people.stamps_needed }, (_, i) => (
            <Box
              key={i}
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: `2px solid ${roles.primary}`,
              }}
            />
          ))}
        </Stack>
      </Card>
    </Stack>
  )
}

/** One step of the order story behind the tour card, read only. */
export function TourChain({ index, state }: { index: number; state: ChainState }) {
  const c = chainCopy(useLocale())
  return (
    <TourPanel>
      {state && 'story' in state ? (
        <Panel index={index} story={state.story} c={c} />
      ) : state ? (
        <Typography role="status">{c.failed}</Typography>
      ) : (
        <Stack spacing={2} role="status" aria-label={c.loading}>
          <Skeleton variant="rounded" height={120} />
          <Skeleton variant="rounded" height={160} />
        </Stack>
      )}
    </TourPanel>
  )
}
