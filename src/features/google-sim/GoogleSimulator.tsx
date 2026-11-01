import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import type { components } from '../../api/generated'
import { layout, shape } from '../../design/theme'
import type { Api, Business } from '../v1/api'
import { useBackClose } from '../v1/backStack'
import { useWorkspace } from '../v1/workspaceContext'
import { useSimCopy } from './strings'
import { mapsSearch, OWNER_URL } from './links'

type State = components['schemas']['SimState']
type Action = components['schemas']['SimAction']
type InputAction = Omit<Action, 'version' | 'value'> & { value?: string }
type Facts = components['schemas']['SimFacts']
type Scenario = State['scenario']
const scenarios: Scenario[] = [
  'new-store-success',
  'service-area',
  'existing-managed',
  'claim-pending',
  'claim-rejected',
  'ambiguous-match',
  'video-required',
  'code-expired',
  'submit-unknown',
  'restricted',
  'reauthorization-required',
  'ineligible',
]
const categories = {
  SG: ['hawker_stall', 'cafe', 'bakery', 'grocery'],
  JP: ['cafe', 'bakery', 'grocery'],
} as const
const requestedScenario = new URLSearchParams(window.location.search).get('sim')

/** With `visitor` (the public demo) only the journey shows: no reviewer fixtures, no live links. */
export function GoogleSimulator({ visitor = false }: { visitor?: boolean }) {
  const t = useSimCopy()
  const ws = useWorkspace()
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState(false)
  const [scenario, setScenario] = useState<Scenario>(
    scenarios.includes(requestedScenario as Scenario)
      ? (requestedScenario as Scenario)
      : 'new-store-success',
  )
  const [forceScenario, setForceScenario] = useState(false)
  if (!ws.active) return null
  return (
    <Stack spacing={3}>
      <Button
        variant="outlined"
        onClick={() => {
          setFind(false)
          setOpen(true)
        }}
      >
        {t.start}
      </Button>
      <Button
        variant="outlined"
        onClick={() => {
          setFind(true)
          setOpen(true)
        }}
      >
        {t.find}
      </Button>
      {!visitor && (
        <Box
          component="details"
          sx={{
            '& summary': { minHeight: layout.target, cursor: 'pointer', alignContent: 'center' },
          }}
        >
          <Typography component="summary" variant="labelLarge">
            {t.reviewer}
          </Typography>
          <Stack spacing={3} sx={{ pt: 3 }}>
            <Typography variant="bodyMedium">{t.scenarioHelp}</Typography>
            <TextField
              select
              label={t.scenario}
              value={scenario}
              onChange={(event) => {
                setScenario(event.target.value as Scenario)
                setForceScenario(true)
              }}
            >
              {scenarios.map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </TextField>
            <Button
              onClick={() => {
                setForceScenario(true)
                setOpen(true)
              }}
            >
              {t.reset}
            </Button>
          </Stack>
        </Box>
      )}
      {open && (
        <Wizard
          key={ws.active.id}
          shop={ws.active}
          api={ws.api}
          scenario={scenario}
          forceScenario={forceScenario}
          find={find}
          visitor={visitor}
          close={() => {
            setOpen(false)
            setForceScenario(false)
          }}
        />
      )}
    </Stack>
  )
}

function Wizard({
  shop,
  api,
  scenario,
  forceScenario,
  find,
  visitor,
  close,
}: {
  shop: Business
  api: Api
  scenario: Scenario
  forceScenario: boolean
  find: boolean
  visitor: boolean
  close: () => void
}) {
  const t = useSimCopy()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const path = `/businesses/${shop.id}/google-sim`
  useBackClose(true, close)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        let saved = await api<State>(path, { signal: controller.signal })
        if (forceScenario || (saved.version === 0 && saved.scenario !== scenario)) {
          saved = await api<State>(path + '/reset', {
            method: 'POST',
            signal: controller.signal,
            body: JSON.stringify({ scenario, version: saved.version }),
          })
        }
        setState(saved)
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      }
    }
    void load()
    return () => controller.abort()
  }, [api, path, scenario, forceScenario])

  async function send(action: InputAction) {
    if (!state || busy) return
    setBusy(true)
    setFailed(false)
    try {
      setState(
        await api<State>(path, {
          method: 'POST',
          body: JSON.stringify({ ...action, version: state.version }),
        }),
      )
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  async function reset(scenario: Scenario) {
    if (!state || busy) return
    setBusy(true)
    setFailed(false)
    try {
      setState(
        await api<State>(path + '/reset', {
          method: 'POST',
          body: JSON.stringify({ scenario, version: state.version }),
        }),
      )
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  async function reload() {
    setBusy(true)
    try {
      setState(await api<State>(path))
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  const s = state
  const button = (label: string, action: InputAction, primary = false) => (
    <Button
      key={label}
      disabled={busy}
      variant={primary ? 'contained' : 'outlined'}
      onClick={() => void send(action)}
    >
      {label}
    </Button>
  )
  const official = (
    <Button component="a" href={OWNER_URL} target="_blank" rel="noopener noreferrer">
      {t.handoff}
    </Button>
  )
  return (
    <Dialog
      open
      fullScreen={fullScreen}
      fullWidth
      maxWidth="md"
      aria-labelledby="sim-title"
      onClose={busy ? undefined : close}
      transitionDuration={0}
      sx={{
        '& .MuiButton-root': { minHeight: layout.target },
        '& .MuiInputBase-root': { minHeight: layout.target },
        '& .MuiDialog-paper': {
          borderRadius: fullScreen ? 0 : `${shape.xl}px`,
          bgcolor: theme.material.surfaceContainerLow,
          pb: 'env(safe-area-inset-bottom)',
        },
      }}
    >
      <DialogTitle id="sim-title" variant="titleLarge">
        {t.title}
      </DialogTitle>
      <DialogContent aria-busy={busy}>
        <Stack spacing={4}>
          <Typography variant="titleMedium">{shop.fields.name}</Typography>
          {visitor && <Alert severity="info">{t.pretend}</Alert>}
          {failed && (
            <Alert
              severity="error"
              action={
                <Button disabled={busy} onClick={() => void reload()}>
                  {t.reload}
                </Button>
              }
            >
              {t.failed}
            </Alert>
          )}
          {!s && <Typography>{t.loading}</Typography>}
          {s && (
            <>
              {s.account === 'demo-owner' && (
                <Typography variant="bodyMedium">{t.account}</Typography>
              )}
              {s.selected && (
                <Typography variant="bodyMedium">
                  {t.selected}:{' '}
                  {s.selected === 'new'
                    ? t.newListing
                    : s.matches?.find((match) => match.id === s.selected)?.address}
                </Typography>
              )}
              {s.ownership !== 'none' && s.phase !== 'claim' && (
                <Typography variant="bodyMedium">
                  {t.ownership}: {t.ownershipStatuses[s.ownership]}
                </Typography>
              )}
              {s.error && <Alert severity="error">{t.errors[s.error]}</Alert>}
              {s.authorization === 'required' && <Alert severity="warning">{t.reauthorize}</Alert>}
              {s.needs_reverification && <Alert severity="warning">{t.reverification}</Alert>}
              {s.phase === 'goal' &&
                button(find ? t.find : t.start, { kind: 'start', value: find ? 'find' : '' }, true)}
              {s.phase === 'type' && (
                <>
                  <Typography component="h2" variant="titleLarge">
                    {t.type}
                  </Typography>
                  {(['store', 'service', 'online'] as const).map((type) =>
                    button(t.types[type], { kind: 'type', value: type }),
                  )}
                </>
              )}
              {s.phase === 'facts' && (
                <FactsForm
                  key={s.preview_revision}
                  state={s}
                  busy={busy}
                  visitor={visitor}
                  save={(facts) => void send({ kind: 'facts', facts })}
                />
              )}
              {s.phase === 'permission' && (
                <>
                  <Typography component="h2" variant="titleLarge">
                    {t.permission}
                  </Typography>
                  <Typography variant="bodyMedium">{t.fictionalAccount}</Typography>
                  {button(t.account, { kind: 'authorize', value: 'demo-owner' }, true)}
                  {button(t.wrongAccount, { kind: 'authorize', value: 'wrong' })}
                  {button(t.cancel, { kind: 'cancel' })}
                </>
              )}
              {s.phase === 'search' && (
                <>
                  <Typography component="h2" variant="titleLarge">
                    {t.search}
                  </Typography>
                  {s.matches?.length ? (
                    s.matches.map((match) => (
                      <Stack key={match.id} spacing={2}>
                        <Typography>
                          {match.name} · {match.address}
                        </Typography>
                        <Typography variant="bodyMedium">
                          {t.management[match.management]}
                        </Typography>
                        {button(`${t.continue}: ${match.address}`, {
                          kind: 'select',
                          value: match.id,
                        })}
                      </Stack>
                    ))
                  ) : (
                    <>
                      <Typography>{t.noMatches}</Typography>
                      {button(t.newListing, { kind: 'select', value: 'new' }, true)}
                    </>
                  )}
                </>
              )}
              {s.phase === 'claim' && (
                <>
                  <Typography component="h2" variant="titleLarge">
                    {t.ownership}
                  </Typography>
                  <Alert severity="info">{t.ownershipStatuses[s.ownership ?? 'none']}</Alert>
                  {s.ownership === 'none' && button(t.claim, { kind: 'claim' }, true)}
                  {s.ownership !== 'none' && (
                    <Typography variant="bodyMedium">{t.claimSaved}</Typography>
                  )}
                </>
              )}
              {s.phase === 'review' && (
                <>
                  <Typography component="h2" variant="titleLarge">
                    {t.review}
                  </Typography>
                  <Typography variant="bodyMedium">{t.destination}</Typography>
                  <Typography variant="bodyMedium">
                    {t.operations[s.operation ?? 'create']}
                  </Typography>
                  <Typography variant="labelMedium">
                    {t.revision}: {s.preview_revision}
                  </Typography>
                  <Preview state={s} />
                  <Alert severity="info">{t.local}</Alert>
                  {button(t.edit, { kind: 'edit' })}
                  {button(t.approve, { kind: 'submit', revision: s.preview_revision }, true)}
                </>
              )}
              {s.phase === 'pending' && (
                <>
                  <Typography component="h2" variant="titleLarge">
                    {t.pending}
                  </Typography>
                  <Typography>{t.reconcileHelp}</Typography>
                  {button(t.reconcile, { kind: 'reconcile' }, true)}
                </>
              )}
              {s.phase === 'verify' && (
                <>
                  <Typography component="h2" variant="titleLarge">
                    {t.verify}
                  </Typography>
                  {!s.methods?.length && (
                    <>
                      <Alert severity="info">{t.noMethods}</Alert>
                    </>
                  )}
                  {s.methods?.map((method) =>
                    button(t.methods[method], { kind: 'method', value: method }),
                  )}
                  {s.method && (
                    <CodeForm key={`${s.method}-${s.attempt}`} state={s} busy={busy} send={send} />
                  )}
                </>
              )}
              {s.phase === 'video' && (
                <>
                  <Typography component="h2" variant="titleLarge">
                    {t.video}
                  </Typography>
                  <Box component="ul" sx={{ pl: 6 }}>
                    {t.checklist.map((item) => (
                      <Typography component="li" key={item}>
                        {item}
                      </Typography>
                    ))}
                  </Box>
                  {s.rehearsal_complete && <Alert severity="info">{t.prepared}</Alert>}
                  {button(t.rehearse, { kind: 'rehearse', value: 'complete' })}
                  {button(t.cancelRehearsal, { kind: 'rehearse', value: 'cancel' })}
                </>
              )}
              {s.phase === 'result' && (
                <>
                  <Typography component="h2" variant="titleLarge">
                    {t.result}
                  </Typography>
                  <Preview state={s} />
                  {button(t.edit, { kind: 'edit' })}
                </>
              )}
              {s.phase === 'ineligible' && <Alert severity="info">{t.ineligible}</Alert>}
              {s.receipt && (
                <Typography variant="bodyMedium">
                  {t.receipt}: {s.receipt} · {t.submissions}: {s.submissions}
                </Typography>
              )}
              {(['verify', 'video', 'result', 'pending'] as const).some(
                (phase) => phase === s.phase,
              ) && (
                <Stack spacing={2}>
                  <Typography>
                    {t.verification}: {t.verificationStatuses[s.verification ?? 'unverified']}
                  </Typography>
                  <Typography>
                    {t.publication}: {t.publicationStatuses[s.publication ?? 'not_submitted']}
                  </Typography>
                </Stack>
              )}
              {s.phase === 'disconnect' && (
                <>
                  <Typography component="h2" variant="titleLarge">
                    {t.removal}
                  </Typography>
                  <Alert severity="info">{t.removalStatuses[s.removal ?? 'connected']}</Alert>
                  <Typography>{t.keepsListing}</Typography>
                </>
              )}
              {!visitor && (
                <>
                  <Stack spacing={1}>
                    <Typography variant="labelMedium">{t.liveMaps}</Typography>
                    <Button
                      component="a"
                      href={mapsSearch(
                        s.facts.name,
                        s.business_type === 'service' ? s.facts.service_area : s.facts.location,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t.mapsHandoff}
                    </Button>
                    <Typography variant="labelMedium">{t.liveOwner}</Typography>
                    {official}
                    <Typography variant="bodyMedium">{t.handoffHelp}</Typography>
                  </Stack>
                  <Box
                    component="details"
                    sx={{
                      '& summary': {
                        minHeight: layout.target,
                        cursor: 'pointer',
                        display: 'list-item',
                        alignContent: 'center',
                      },
                    }}
                  >
                    <Typography component="summary" variant="labelLarge">
                      {t.reviewer}
                    </Typography>
                    <Stack spacing={3} sx={{ pt: 3 }}>
                      <Typography variant="bodyMedium">{t.scenarioHelp}</Typography>
                      <TextField
                        select
                        label={t.scenario}
                        value={s.scenario}
                        disabled={busy}
                        onChange={(event) => void reset(event.target.value as Scenario)}
                      >
                        {scenarios.map((scenario) => (
                          <MenuItem key={scenario} value={scenario}>
                            {scenario}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Button
                        disabled={busy}
                        onClick={() => void reset(s.scenario ?? 'new-store-success')}
                      >
                        {t.reset}
                      </Button>
                      {s.phase === 'review' &&
                        button(t.rejectField, {
                          kind: 'submit',
                          revision: s.preview_revision,
                          value: 'reject-hours',
                        })}
                      {s.phase === 'claim' && s.ownership === 'pending' && (
                        <>
                          {button(t.grant, { kind: 'claim_result', value: 'granted' })}
                          {button(t.rejectClaim, { kind: 'claim_result', value: 'rejected' })}
                        </>
                      )}
                      {s.phase !== 'goal' &&
                        s.phase !== 'disconnect' &&
                        button(t.disconnect, { kind: 'disconnect' })}
                      {s.phase === 'disconnect' &&
                        s.removal === 'pending' &&
                        button(t.confirmRemoval, { kind: 'confirm_removal' })}
                    </Stack>
                  </Box>
                </>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 6 }}>
        <Button disabled={busy} onClick={close}>
          {t.close}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function FactsForm({
  state,
  busy,
  visitor,
  save,
}: {
  state: State
  busy: boolean
  visitor: boolean
  save: (facts: Facts) => void
}) {
  const t = useSimCopy()
  const [facts, setFacts] = useState(state.facts)
  const [editing, setEditing] = useState(state.selected != null)
  const region = facts.region ?? 'SG'
  const fields = ['name', 'location', 'service_area', 'hours', 'phone', 'website'] as const
  return (
    <Stack
      component="form"
      spacing={4}
      onSubmit={(event) => {
        event.preventDefault()
        save(facts)
      }}
    >
      <Typography component="h2" variant="titleLarge">
        {t.facts}
      </Typography>
      <Typography variant="bodyMedium">{t.reused}</Typography>
      {!editing && (
        <Button onClick={() => setEditing(true)} disabled={busy}>
          {t.edit}
        </Button>
      )}
      {state.business_type === 'service' && <Alert severity="info">{t.privateAddress}</Alert>}
      {fields
        .filter((key) => key !== 'service_area' || state.business_type === 'service')
        .map((key) => (
          <TextField
            key={key}
            label={t.fields[key]}
            value={facts[key] ?? ''}
            disabled={busy}
            onChange={(event) => setFacts({ ...facts, [key]: event.target.value })}
            slotProps={{
              input: { readOnly: !editing && Boolean(state.facts[key]) },
              htmlInput: {
                maxLength:
                  key === 'phone'
                    ? 40
                    : key === 'location' || key === 'service_area' || key === 'website'
                      ? 300
                      : 180,
              },
            }}
          />
        ))}
      {!visitor && (
        <TextField
          select
          label={t.fields.region}
          value={region}
          disabled={busy}
          onChange={(event) =>
            setFacts({ ...facts, region: event.target.value as Facts['region'], category_id: '' })
          }
        >
          {(['SG', 'JP'] as const).map((value) => (
            <MenuItem key={value} value={value}>
              {t.regions[value]}
            </MenuItem>
          ))}
        </TextField>
      )}
      <TextField
        select
        label={t.fields.category_id}
        value={facts.category_id ?? ''}
        disabled={busy}
        onChange={(event) => setFacts({ ...facts, category_id: event.target.value })}
      >
        <MenuItem value="">{t.chooseCategory}</MenuItem>
        {categories[region].map((value) => (
          <MenuItem key={value} value={value}>
            {t.categories[value]}
          </MenuItem>
        ))}
      </TextField>
      <Button variant="contained" type="submit" disabled={busy}>
        {t.continue}
      </Button>
    </Stack>
  )
}

function Preview({ state }: { state: State }) {
  const t = useSimCopy()
  const f = state.facts
  const keys = [
    'name',
    'category_id',
    state.business_type === 'service' ? 'service_area' : 'location',
    'hours',
    'phone',
    'website',
  ] as const
  return (
    <Stack spacing={2}>
      {state.business_type === 'service' && <Alert severity="info">{t.privateAddress}</Alert>}
      {keys.map((key) => (
        <Typography key={key} variant="bodyMedium" sx={{ overflowWrap: 'anywhere' }}>
          {t.fields[key]}:{' '}
          {key === 'category_id'
            ? t.categories[f.category_id as keyof typeof t.categories]
            : f[key]}
        </Typography>
      ))}
    </Stack>
  )
}

function CodeForm({
  state,
  busy,
  send,
}: {
  state: State
  busy: boolean
  send: (action: InputAction) => Promise<void>
}) {
  const t = useSimCopy()
  const [code, setCode] = useState('')
  return (
    <Stack
      component="form"
      spacing={3}
      onSubmit={(event) => {
        event.preventDefault()
        void send({ kind: 'code', value: code, attempt: state.attempt })
      }}
    >
      <Typography variant="bodyMedium">{t.methodHelp[state.method!]}</Typography>
      <TextField
        label={t.code}
        helperText={t.codeHelp}
        value={code}
        disabled={busy}
        onChange={(event) => setCode(event.target.value)}
        slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6, autoComplete: 'off' } }}
      />
      <Button type="submit" variant="contained" disabled={busy}>
        {t.verifyCode}
      </Button>
      <Button disabled={busy} onClick={() => void send({ kind: 'resend' })}>
        {t.resend}
      </Button>
    </Stack>
  )
}
