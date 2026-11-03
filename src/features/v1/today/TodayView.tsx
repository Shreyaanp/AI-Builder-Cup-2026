import { useEffect, useId, useState } from 'react'
import { AiInfo } from '../AiInfo'
import type { ReactNode } from 'react'
import {
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  LinearProgress,
  Skeleton,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import {
  Camera,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  ClipboardCheck,
  Globe,
  MessageSquare,
  Mic,
  Moon,
  NotebookPen,
  PackageMinus,
  PencilLine,
  Sparkles,
  ZapOff,
  ShieldCheck,
} from 'lucide-react'
import { useIdentity } from '../../../auth/useIdentity'
import { HAND_FONT, enterRise, motion, shape } from '../../../design/theme'
import { productFeminine, productName } from '../../../i18n/productNames'
import { useLocale } from '../../../state/hooks'
import { closeDayCopy } from '../../closeday/strings'
import { formatShopPrice, shopCurrency } from '../format'
import { useCopy } from '../strings'
import { isServiceShop } from '../tabsCopy'
import { useWorkspace } from '../workspaceContext'
import { useOnboardingCopy } from '../onboardingCopy'
import { useSourceCopy } from './sourceCopy'
import { useTodayCopy, type Festival } from './todayCopy'
import { promiseCopyFor } from './promiseCopy'
import type { CoachLine, Need, StepId, TodayPlan } from './todayPlan'
import { useTodayPlan } from './useTodayPlan'
import { PromiseSupplyRow } from './PromiseSupplyRow'
import { promiseSaid, usePromiseSettle } from './promiseSettle'
import { countAction, countShown } from './habitCount'
import { useLocalDay } from './useLocalDay'
import { FirstCustomers } from '../FirstCustomers'
import { TodaySupplyNeeds } from '../../supply/SupplyEntry'

/** What the Coach screen lets Today do: talk to the coach, open sheets, start the mic. */
export interface TodayActions {
  unread: number | null
  /** Send a message to the coach now. */
  ask: (text: string) => void
  /** Start a message in the composer for the owner to finish. */
  draft: (text: string) => void
  openMessages: () => void
  openSoldOut: () => void
  talk: () => void
  openCloseDay?: () => void
}

const LEAVE_MS = 320

/** The first view of the Coach tab: how the shop is doing and what to do now. */
export function TodayView({
  actions,
  showAiInfo = true,
}: {
  actions: TodayActions
  showAiInfo?: boolean
}) {
  const ws = useWorkspace()
  const tt = useTodayCopy()
  const roles = useTheme().material
  const { name } = useIdentity()
  const { plan, answerMenu, answerPromise, firstCustomers } = useTodayPlan(actions.unread)
  const shop = ws.active
  const shown = plan?.needs.map((need) => need.kind).join(',') ?? null
  const day = useLocalDay()
  useEffect(() => {
    if (shown !== null) countShown(ws, shown ? shown.split(',') : [])
    // Counted when what Today shows changes (or the day turns over), not on every workspace update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, ws.active?.id, day])
  if (!shop) return null
  if (!plan) {
    return (
      <Stack
        spacing={{ xs: 4, sm: 5 }}
        sx={{ pt: { xs: 1, sm: 6 }, pb: 4 }}
        data-testid="today-skeleton"
        aria-busy="true"
      >
        <Box>
          <Skeleton variant="text" width="60%" height={36} />
          <Skeleton variant="text" width="40%" height={24} sx={{ mt: 1 }} />
        </Box>
        <Skeleton variant="rounded" height={160} sx={{ borderRadius: `${shape.xl}px` }} />
        <Skeleton variant="rounded" height={120} sx={{ borderRadius: `${shape.lg}px` }} />
      </Stack>
    )
  }
  return (
    <Stack spacing={{ xs: 4, sm: 5 }} sx={{ pt: { xs: 1, sm: 6 }, pb: 4 }} data-testid="today">
      <Box data-tour="today">
        <Typography component="h1" variant="headlineSmall" sx={{ overflowWrap: 'anywhere' }}>
          {tt.greet(plan.part, name ?? '')}
        </Typography>
        {plan.line && <LineText line={plan.line} />}
      </Box>
      {plan.progress && (
        <Box data-testid="today-progress">
          <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="labelMedium" color="text.secondary">
              {tt.setup}
            </Typography>
            <Typography
              variant="labelMedium"
              sx={{ fontVariantNumeric: 'tabular-nums', color: roles.onSurfaceVariant }}
            >
              {plan.progress.done}/{plan.progress.total}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={(plan.progress.done / plan.progress.total) * 100}
            aria-label={`${tt.setup}: ${plan.progress.done}/${plan.progress.total}`}
            sx={{ height: 4, borderRadius: 2, bgcolor: roles.surfaceContainerHighest }}
          />
        </Box>
      )}
      {plan.dayOne && <DayOne step={plan.dayOne.step} food={plan.food} actions={actions} />}
      {/* One card, one filled button: the first row is the lead action, and stock (the supply
          row with its run-out day, low items and supply exceptions) lives only here. */}
      <NeedsCard
        key={shop.id}
        plan={plan}
        actions={actions}
        answerMenu={answerMenu}
        answerPromise={answerPromise}
        footer={<TodaySupplyNeeds inCard={plan.needs.length > 0} />}
      />
      {firstCustomers && ws.shareUrl && (
        <FirstCustomers url={ws.shareUrl} name={shop.fields.name} />
      )}
      {(plan.pulse || plan.forecast) && (
        <Box>
          <PulseCard plan={plan} actions={actions} />
          {plan.forecast && showAiInfo && <AiInfo feature="forecast" />}
        </Box>
      )}
    </Stack>
  )
}

function LineText({ line }: { line: CoachLine }) {
  const tt = useTodayCopy()
  const locale = useLocale()
  const roles = useTheme().material
  const number = new Intl.NumberFormat(locale)
  let text = ''
  if (line.kind === 'festival' && line.festival && line.days != null)
    text = tt.festival(tt.festivals[line.festival as Festival] ?? line.festival, line.days)
  else if (line.kind === 'rain' && line.rain != null) text = tt.rain(line.rain)
  else if (line.kind === 'busiest_day' && line.weekday != null && line.item && line.count) {
    // 5 Jan 2026 was a Monday: weekday 0 → Monday in the owner's language.
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 0, 5 + line.weekday)),
    )
    text = tt.busiest(weekday, number.format(line.count), productName(line.item, locale))
  }
  if (!text) return null
  return (
    <Stack
      direction="row"
      data-testid="today-line"
      sx={{ gap: 2, mt: 2, alignItems: 'flex-start', color: roles.onSurfaceVariant }}
    >
      <Box aria-hidden="true" sx={{ display: 'flex', color: roles.primary, pt: 0.5 }}>
        <Sparkles size={18} />
      </Box>
      <Typography variant="bodyLarge">{text}</Typography>
    </Stack>
  )
}

function stepText(
  step: StepId,
  food: boolean,
  tt: ReturnType<typeof useTodayCopy>,
  o: ReturnType<typeof useOnboardingCopy>,
) {
  return {
    items: tt.stepItems(food),
    category: tt.stepCategory,
    location: tt.stepLocation,
    hours: tt.stepHours,
    photo: o.stepPhoto,
    phone: tt.stepPhone,
    share: tt.stepShare,
    face: o.stepFace,
  }[step]
}

interface StepAction {
  label: string
  icon: ReactNode
  run: () => void
  /** "Add your menu": by photo, or typed in (owner decision, 17 Oct). */
  second?: { label: string; run: () => void }
}

function useStepAction(step: StepId): StepAction {
  const ws = useWorkspace()
  const tt = useTodayCopy()
  const o = useOnboardingCopy()
  if (step === 'items')
    return {
      label: tt.scan,
      icon: <Camera size={18} />,
      run: ws.requestPhoto,
      second: { label: o.typeMenu, run: () => ws.openEditor({ kind: 'product', product: null }) },
    }
  if (step === 'photo')
    return { label: o.takePhoto, icon: <Camera size={18} />, run: ws.requestPhoto }
  if (step === 'face')
    return { label: o.verify, icon: <ShieldCheck size={18} />, run: () => ws.setFaceOpen(true) }
  if (step === 'share')
    return { label: tt.share, icon: <Globe size={18} />, run: () => ws.go('shop') }
  return {
    label: tt.add,
    icon: <PencilLine size={18} />,
    run: () =>
      ws.active && ws.openEditor({ kind: 'business', fields: ws.active.fields, step: 'phone' }),
  }
}

/** A brand-new shop: one warm line, the next step and the mic. */
function DayOne({ step, food, actions }: { step: StepId; food: boolean; actions: TodayActions }) {
  const ws = useWorkspace()
  const tt = useTodayCopy()
  const o = useOnboardingCopy()
  const roles = useTheme().material
  const action = useStepAction(step)
  const name = ws.active?.fields.name ?? ''
  // OB-306: an already shared shop is online; lead with its next task instead.
  const shared = Boolean(ws.active?.public)
  return (
    <Box
      component="section"
      aria-labelledby="today-day-one"
      data-testid="today-day-one"
      sx={{
        p: { xs: 4, sm: 5 },
        borderRadius: `${shape.xl}px`,
        bgcolor: roles.surfaceContainer,
        ...enterRise,
      }}
    >
      <Typography
        id="today-day-one"
        component="h2"
        variant="headlineSmall"
        sx={{
          fontFamily: HAND_FONT,
          fontWeight: 700,
          lineHeight: 1.2,
        }}
      >
        {shared ? stepText(step, food, tt, o) : tt.dayOne(name)}
      </Typography>
      <Typography
        variant="bodyLarge"
        color="text.secondary"
        sx={{ mt: 1, overflowWrap: 'anywhere' }}
      >
        {shared ? name : stepText(step, food, tt, o)}
      </Typography>
      <Stack direction="row" sx={{ mt: 4, gap: 2, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={action.icon}
          onClick={action.run}
          sx={{ minHeight: 48 }}
        >
          {action.label}
        </Button>
        {action.second && (
          <Button
            variant="outlined"
            startIcon={<PencilLine size={18} />}
            onClick={action.second.run}
            sx={{ minHeight: 48 }}
          >
            {action.second.label}
          </Button>
        )}
        <Button
          variant="outlined"
          startIcon={<Mic size={18} />}
          onClick={actions.talk}
          sx={{ minHeight: 48 }}
        >
          {tt.talk}
        </Button>
      </Stack>
    </Box>
  )
}

/**
 * Rows that just left stay a moment with a check, then go (static under reduced motion). A row
 * that only moved (into or out of "N more things") is not done: it goes at once, with no check.
 */
function useLeaving(needs: Need[], moved: Need[]): { need: Need; leaving: boolean }[] {
  const ids = needs.map((need) => need.id).join('|')
  const elsewhere = new Set(moved.map((need) => need.id))
  const [state, setState] = useState<{ ids: string; rows: { need: Need; leaving: boolean }[] }>(
    () => ({ ids, rows: needs.map((need) => ({ need, leaving: false })) }),
  )
  let rows = state.rows
  if (state.ids !== ids) {
    const current = new Map(needs.map((need) => [need.id, need]))
    const next = needs.map((need) => ({ need, leaving: false }))
    state.rows.forEach((row, index) => {
      if (!current.has(row.need.id) && !elsewhere.has(row.need.id))
        next.splice(Math.min(index, next.length), 0, { need: row.need, leaving: true })
    })
    rows = next
    setState({ ids, rows })
  }
  const leaving = rows.some((row) => row.leaving)
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(
      () => setState((s) => ({ ...s, rows: s.rows.filter((row) => !row.leaving) })),
      LEAVE_MS,
    )
    return () => clearTimeout(timer)
  }, [leaving, ids])
  // Live rows always show their latest numbers.
  const latest = new Map(needs.map((need) => [need.id, need]))
  return rows.map((row) => ({ ...row, need: latest.get(row.need.id) ?? row.need }))
}

/** "Needs you now": three live items, then "N more things"; "All set for today" when none. */
export function NeedsCard({
  plan,
  actions,
  answerMenu,
  answerPromise,
  compact = false,
  footer,
}: {
  plan: TodayPlan
  actions: TodayActions
  answerMenu: () => void
  answerPromise: (day: string) => void
  compact?: boolean
  /** Shown inside the card after the rows (Today's supply exceptions); alone when no rows. */
  footer?: ReactNode
}) {
  const tt = useTodayCopy()
  const roles = useTheme().material
  const rows = useLeaving(plan.needs, plan.more)
  const moreRows = useLeaving(plan.more, plan.needs)
  // The lead is the first live row: a row on its way out never holds the one filled button.
  const lead = rows.find((each) => !each.leaving)
  const [open, setOpen] = useState(false)
  const moreId = useId()
  const row = ({ need, leaving }: { need: Need; leaving: boolean }, first: boolean) =>
    need.kind === 'supply' || (need.kind === 'promise' && need.supply) ? (
      leaving ? null : (
        <PromiseSupplyRow
          key={need.id}
          promise={need.kind === 'promise' ? need.promise : null}
          first={first}
          answerPromise={answerPromise}
        />
      )
    ) : (
      <NeedRow
        key={need.id}
        need={need}
        leaving={leaving}
        first={first}
        food={plan.food}
        actions={actions}
        answerMenu={answerMenu}
        answerPromise={answerPromise}
      />
    )
  const list = {
    listStyle: 'none',
    m: 0,
    p: 0,
    '& > li + li': { borderTop: `1px solid ${roles.outlineVariant}` },
  }
  if (!rows.length)
    return compact || plan.dayOne ? (
      footer
    ) : (
      <>
        <Stack
          direction="row"
          data-testid="today-all-set"
          sx={{ gap: 2, alignItems: 'center', color: roles.onSurfaceVariant, ...enterRise }}
        >
          <CircleCheck size={20} color={roles.primary} aria-hidden="true" />
          <Typography variant="titleMedium" component="p">
            {tt.allSet}
          </Typography>
        </Stack>
        {footer}
      </>
    )
  return (
    <Box
      component="section"
      aria-labelledby={compact ? undefined : 'today-needs'}
      aria-label={compact ? tt.needsTitle : undefined}
      data-testid="today-needs"
      sx={{
        p: compact ? 2 : { xs: 3, sm: 4 },
        borderRadius: `${shape.lgIncreased}px`,
        bgcolor: roles.surfaceContainerHigh,
        ...(compact ? {} : enterRise),
      }}
    >
      {!compact && (
        <Typography
          id="today-needs"
          component="h2"
          variant="headlineSmall"
          sx={{
            fontFamily: HAND_FONT,
            fontWeight: 700,
            lineHeight: 1.2,
            px: 1,
            mb: 1,
          }}
        >
          {tt.needsTitle}
        </Typography>
      )}
      <Stack component="ul" sx={list}>
        {rows.map((each) => row(each, each === lead && !plan.dayOne && !compact))}
      </Stack>
      {/* The rest stay one tap away in the same card, with text buttons only: one filled
          button on the card, and nothing drops off Coach (SIMPLIFY Batch 5). */}
      {moreRows.length > 0 && (
        <>
          <Button
            variant="text"
            aria-expanded={open}
            aria-controls={open ? moreId : undefined}
            onClick={() => setOpen((was) => !was)}
            endIcon={
              <ChevronDown
                size={18}
                aria-hidden="true"
                style={{ transform: open ? 'rotate(180deg)' : undefined }}
              />
            }
            sx={{ minHeight: 48, mt: 1, px: 1 }}
          >
            {open ? tt.hide : tt.more(plan.more.length)}
          </Button>
          {open && (
            <Stack
              component="ul"
              id={moreId}
              data-testid="today-more"
              sx={{ ...list, borderTop: `1px solid ${roles.outlineVariant}` }}
            >
              {moreRows.map((each) => row(each, false))}
            </Stack>
          )}
        </>
      )}
      {footer}
    </Box>
  )
}

function NeedRow({
  need,
  leaving,
  first,
  food,
  actions,
  answerMenu,
  answerPromise,
}: {
  need: Need
  leaving: boolean
  first: boolean
  food: boolean
  actions: TodayActions
  answerMenu: () => void
  answerPromise: (day: string) => void
}) {
  const t = useCopy()
  const tt = useTodayCopy()
  const sc = useSourceCopy()
  const o = useOnboardingCopy()
  const locale = useLocale()
  const pc = promiseCopyFor(locale)
  const ws = useWorkspace()
  const roles = useTheme().material
  const [busy, setBusy] = useState(false)
  const step = useStepAction(need.kind === 'step' ? need.step : 'items')
  const promiseSettle = usePromiseSettle(
    need.kind === 'promise' ? need.promise : null,
    answerPromise,
  )
  const primary = first ? 'contained' : 'text'
  async function run(work: () => Promise<unknown>) {
    setBusy(true)
    try {
      await work()
    } catch {
      ws.notify(t.actionFailed)
    } finally {
      setBusy(false)
    }
  }
  let icon: ReactNode
  let text = ''
  let buttons: ReactNode
  if (need.kind === 'promise') {
    // Last night's promise (HABIT change 4): do it, or "Not today" clears it with no comment.
    const { promise } = need
    icon = <NotebookPen size={20} />
    text = promiseSaid(promise, locale)
    const { settle } = promiseSettle
    const doIt =
      promise.item && promise.kind === 'order'
        ? { label: pc.orderNow, ask: tt.orderDraft(promise.item) }
        : promise.item && promise.kind === 'make'
          ? { label: pc.makeMore, ask: sc.makeDraft(promise.item) }
          : null
    buttons = (
      <>
        <Button
          variant={primary}
          disabled={promiseSettle.busy}
          sx={{ minHeight: 48 }}
          onClick={() => {
            settle('done')
            if (doIt) actions.ask(doIt.ask)
          }}
        >
          {doIt?.label ?? pc.done}
        </Button>
        {/* Clearing it is not a useful action: never action_done, never the first action. */}
        <Button
          disabled={promiseSettle.busy}
          data-uncounted
          sx={{ minHeight: 48 }}
          onClick={() => settle('skipped')}
        >
          {pc.notToday}
        </Button>
      </>
    )
  } else if (need.kind === 'reply') {
    icon = <MessageSquare size={20} />
    text = tt.waiting(need.count)
    buttons = (
      <Button variant={primary} sx={{ minHeight: 48 }} onClick={actions.openMessages}>
        {tt.reply}
      </Button>
    )
  } else if (need.kind === 'closeDay') {
    const cd = closeDayCopy(locale)
    icon = <Moon size={20} />
    text = cd.tileEvening
    buttons = (
      <Button variant={primary} sx={{ minHeight: 48 }} onClick={actions.openCloseDay}>
        {cd.title}
      </Button>
    )
  } else if (need.kind === 'menu') {
    icon = <ClipboardCheck size={20} />
    text = tt.sameMenu(food)
    buttons = (
      <>
        <Button
          variant={primary}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} /> : undefined}
          sx={{ minHeight: 48 }}
          onClick={() =>
            void run(async () => {
              if (!ws.active) return
              await ws.api(`/businesses/${ws.active.id}/freshness/confirm`, { method: 'POST' })
              answerMenu()
              await ws.reload()
            })
          }
        >
          {tt.yes}
        </Button>
        <Button
          disabled={busy}
          sx={{ minHeight: 48 }}
          onClick={() => {
            answerMenu()
            actions.draft(t.todayDraft)
          }}
        >
          {tt.changed}
        </Button>
      </>
    )
  } else if (need.kind === 'low') {
    icon = <PackageMinus size={20} />
    const name = productName(need.item, locale)
    const productId = need.productId
    if (need.source === 'unknown' && productId) {
      // One question, saved on the item so it is never asked again (OB-239).
      text = sc.ask(name, need.left)
      const answer = (source: 'made' | 'bought') =>
        void run(async () => {
          if (!ws.active) return
          await ws.api(
            `/businesses/${ws.active.id}/inventory/${encodeURIComponent(productId)}/source`,
            { method: 'POST', body: JSON.stringify({ source }) },
          )
          await ws.reload()
        })
      buttons = (
        <>
          <Button
            variant={primary}
            disabled={busy}
            aria-label={sc.makeLabel(name)}
            sx={{ minHeight: 48, minWidth: 48 }}
            onClick={() => answer('made')}
          >
            {sc.make}
          </Button>
          <Button
            variant={first ? 'outlined' : 'text'}
            disabled={busy}
            aria-label={sc.buyLabel(name)}
            sx={{ minHeight: 48, minWidth: 48 }}
            onClick={() => answer('bought')}
          >
            {sc.buy}
          </Button>
        </>
      )
    } else if (need.source === 'made') {
      // Made here: the prep plan, never a supplier order (OB-239).
      text = tt.low(name, need.left)
      buttons = (
        <Button
          variant={primary}
          sx={{ minHeight: 48 }}
          onClick={() => actions.ask(sc.makeDraft(need.item))}
        >
          {sc.makeMore}
        </Button>
      )
    } else if (need.source === 'unknown') {
      // Not said, and no item to save the answer on: never an Order button (OB-243).
      text = sc.askInMenu(name, need.left, isServiceShop(ws.active?.fields.category))
    } else {
      text = tt.low(name, need.left)
      buttons = (
        <Button
          variant={primary}
          sx={{ minHeight: 48 }}
          onClick={() => actions.ask(tt.orderDraft(need.item))}
        >
          {tt.order}
        </Button>
      )
    }
  } else if (need.kind === 'soldOut') {
    icon = <ZapOff size={20} />
    const only = need.items.length === 1 ? need.items[0] : undefined
    text = only
      ? tt.soldOut(productName(only.name, locale), productFeminine(only.name, locale))
      : tt.soldOutMany(need.items.length)
    buttons = only ? (
      <Button
        variant={primary}
        disabled={busy}
        sx={{ minHeight: 48 }}
        onClick={() => void run(() => ws.setAvailability(only, true))}
      >
        {tt.backInStock}
      </Button>
    ) : (
      <Button variant={primary} sx={{ minHeight: 48 }} onClick={actions.openSoldOut}>
        {tt.see}
      </Button>
    )
  } else if (need.kind === 'step') {
    icon = step.icon
    text = stepText(need.step, food, tt, o)
    buttons = (
      <>
        <Button variant={primary} sx={{ minHeight: 48 }} onClick={step.run}>
          {step.label}
        </Button>
        {step.second && (
          <Button sx={{ minHeight: 48 }} onClick={step.second.run}>
            {step.second.label}
          </Button>
        )}
      </>
    )
  } else if (need.kind === 'facts') {
    icon = <CircleHelp size={20} />
    const fact = need.facts[0]!
    text = t.customersAsk(need.facts.map((f) => t.askNames[f]).join(' '))
    buttons = (
      <Button
        variant={primary}
        sx={{ minHeight: 48 }}
        onClick={() => actions.draft(`${t.factNames[fact]}: `)}
      >
        {t.answerNow}
      </Button>
    )
  }
  return (
    <Box
      component="li"
      data-need={need.kind}
      onClickCapture={(event) => {
        const button = (event.target as HTMLElement).closest('button')
        if (button && !button.hasAttribute('data-uncounted')) countAction(ws, need.kind)
      }}
      aria-hidden={leaving || undefined}
      inert={leaving || undefined}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 3,
        rowGap: 1,
        px: 1,
        py: 2,
        minHeight: 56,
        ...(leaving
          ? {
              pointerEvents: 'none',
              '@keyframes todayLeave': {
                from: { opacity: 1, transform: 'none' },
                to: { opacity: 0, transform: 'translateX(16px)' },
              },
              animation: `todayLeave ${LEAVE_MS}ms ${motion.easing.emphasizedAccelerate} both`,
            }
          : enterRise),
      }}
    >
      <Box aria-hidden="true" sx={{ display: 'flex', color: roles.primary, flexShrink: 0 }}>
        {leaving ? <CircleCheck size={20} /> : icon}
      </Box>
      <Typography
        variant="bodyLarge"
        sx={{ flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}
      >
        {text}
      </Typography>
      <Stack direction="row" sx={{ gap: 1, flexShrink: 0, ml: 'auto' }}>
        {buttons}
      </Stack>
    </Box>
  )
}

/** Yesterday (or today so far) and today's forecast; tapping asks the coach for the chart. */
function PulseCard({ plan, actions }: { plan: TodayPlan; actions: TodayActions }) {
  const ws = useWorkspace()
  const tt = useTodayCopy()
  const locale = useLocale()
  const roles = useTheme().material
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const currency = shopCurrency(ws.active)
  // Once the day is closed the pulse is today's, and so is the question it asks (HABIT change 3).
  const ask = plan.pulse?.when === 'today' ? tt.howToday : tt.howYesterday
  const lines: string[] = []
  if (plan.pulse) {
    const values = plan.pulse.values.map(({ metric, value }) => {
      const n = number.format(value)
      if (metric === 'sales')
        // Exact, in the shop's grouping: whole rupees stay whole (₹1,01,000), paise show when present (₹1.01).
        return formatShopPrice(value, currency, locale)
      if (metric === 'items') return tt.sold(n)
      if (metric === 'views') return tt.views(n)
      if (metric === 'questions') return tt.asked(n)
      if (metric === 'stamps') return tt.stamps(n)
      return tt.regulars(n)
    })
    lines.push(
      `${plan.pulse.when === 'yesterday' ? tt.yesterday : tt.todaySoFar}: ${values.join(' · ')}`,
    )
  }
  if (plan.forecast) {
    let text = tt.forecast(
      number.format(plan.forecast.quantity),
      productName(plan.forecast.item, locale),
    )
    if (plan.forecast.busy) {
      const [start, end] = plan.forecast.busy.map(
        (minutes) => new Date(Date.UTC(2026, 0, 1, Math.floor(minutes / 60), minutes % 60)),
      )
      const hours = busyHours(locale, plan.forecast.busy, start!, end!)
      text += `, ${tt.busy(hours)}`
    }
    lines.push(text)
  }
  return (
    <ButtonBase
      data-testid="today-pulse"
      data-tour="forecast"
      aria-label={`${lines.join('. ')}. ${ask}`}
      onClick={() => actions.ask(ask)}
      sx={{
        width: '100%',
        justifyContent: 'flex-start',
        gap: 3,
        px: { xs: 3, sm: 4 },
        py: 3,
        minHeight: 56,
        textAlign: 'start',
        borderRadius: `${shape.lg}px`,
        border: `1px solid ${roles.outlineVariant}`,
        ...enterRise,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {lines.map((line, index) => (
          <Typography
            key={index}
            component="span"
            variant={index === 0 ? 'bodyLarge' : 'bodyMedium'}
            sx={{
              display: 'block',
              color: index === 0 ? roles.onSurface : roles.onSurfaceVariant,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {line}
          </Typography>
        ))}
      </Box>
      <ChevronRight size={20} aria-hidden="true" color={roles.onSurfaceVariant} />
    </ButtonBase>
  )
}

/** While chatting: one slim pill ("2 things need you"); tap to open the items inline. */
export function NeedsPill({ actions }: { actions: TodayActions }) {
  const tt = useTodayCopy()
  const roles = useTheme().material
  const { plan, answerMenu, answerPromise } = useTodayPlan(actions.unread)
  const [open, setOpen] = useState(false)
  const count = plan ? plan.needs.length + plan.more.length : 0
  if (!plan || !count) return null
  return (
    <Box data-testid="today-pill" sx={{ pb: 2 }}>
      <ButtonBase
        aria-expanded={open}
        aria-controls="today-pill-panel"
        onClick={() => setOpen((value) => !value)}
        sx={{
          gap: 2,
          px: 3,
          minHeight: 48,
          borderRadius: `${shape.full}px`,
          bgcolor: roles.secondaryContainer,
          color: roles.onSecondaryContainer,
          ...enterRise,
        }}
      >
        <Box
          aria-hidden="true"
          sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: roles.primary, flexShrink: 0 }}
        />
        <Typography variant="labelLarge" component="span">
          {open ? tt.hide : tt.pill(count)}
        </Typography>
        <Box
          aria-hidden="true"
          sx={{
            display: 'flex',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: `transform ${motion.duration.short}ms ${motion.easing.standard}`,
          }}
        >
          <ChevronDown size={18} />
        </Box>
      </ButtonBase>
      {open && (
        <Box id="today-pill-panel" sx={{ mt: 2 }}>
          <NeedsCard
            plan={plan}
            actions={actions}
            answerMenu={answerMenu}
            answerPromise={answerPromise}
            compact
          />
        </Box>
      )}
    </Box>
  )
}

/** "7:30–9:30 am"; Hindi names the part of the day instead (सुबह 7:30–9:30). */
function busyHours(locale: string, busy: [number, number], start: Date, end: Date): string {
  const minute = busy.some((m) => m % 60) ? '2-digit' : undefined
  if (!locale.toLowerCase().startsWith('hi')) {
    return new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute,
      timeZone: 'UTC',
    }).formatRange(start, end)
  }
  const part = (d: Date) => {
    const h = d.getUTCHours()
    return h < 12 ? 'सुबह' : h < 16 ? 'दोपहर' : h < 20 ? 'शाम' : 'रात'
  }
  const clock = (d: Date) => {
    const m = d.getUTCMinutes()
    return `${d.getUTCHours() % 12 || 12}${minute || m ? `:${String(m).padStart(2, '0')}` : ''}`
  }
  return part(start) === part(end)
    ? `${part(start)} ${clock(start)}–${clock(end)}`
    : `${part(start)} ${clock(start)}–${part(end)} ${clock(end)}`
}
