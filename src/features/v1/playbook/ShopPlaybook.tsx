import { useId, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import { Pencil, RefreshCw, X } from 'lucide-react'
import type { components } from '../../../api/generated'
import { useLocale } from '../../../state/hooks'
import { useConversationCopy } from '../../discover/conversationCopy'
import { ApiError } from '../api'
import { Sheet } from '../Sheet'
import { useWorkspace } from '../workspaceContext'
import { usePlaybookCopy } from './playbookCopy'
import type { FeatureId, MetricId, PlaybookSection } from './playbookCopy'
import { usePlaybook } from './usePlaybook'
import type { PlaybookView } from './usePlaybook'

type Item = components['schemas']['Item']
type Metric = components['schemas']['Metric']
type Feature = components['schemas']['Feature']
type Entry = Item | Metric | Feature | components['schemas']['Watch']

const SECTIONS: PlaybookSection[] = [
  'goals',
  'priorities',
  'key_metrics',
  'watch_list',
  'segments',
  'next_features',
]
// Shown at first; the rest sits behind "More" so the sheet opens as a short read.
const FIRST_SECTIONS = new Set<PlaybookSection>(['goals', 'priorities'])
const FIRST_ENTRIES = 3
// Metrics that have a number on the Today page; the rest are honest "not tracked yet".
const ON_TODAY = new Set<MetricId>([
  'items_sold',
  'sales',
  'questions',
  'views',
  'stamps',
  'returning',
])

/** The You-tab entry: one line about the playbook and the button that opens it. */
export function PlaybookEntry() {
  const t = usePlaybookCopy()
  const ws = useWorkspace()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Typography variant="bodyMedium" color="text.secondary">
        {ws.active ? t.entryBody : t.needShop}
      </Typography>
      <Button
        variant="outlined"
        sx={{ mt: 2 }}
        disabled={!ws.active}
        onClick={() => setOpen(true)}
        data-testid="playbook-open"
      >
        {t.open}
      </Button>
      {ws.active && <PlaybookSheet open={open} onClose={() => setOpen(false)} />}
    </>
  )
}

function PlaybookSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = usePlaybookCopy()
  const titleId = useId()
  const ws = useWorkspace()
  const language = useLocale()
  const { state, setState, retry, activeId } = usePlaybook(open)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<'refresh' | 'save' | null>(null)
  const [status, setStatus] = useState('')
  const [showAll, setShowAll] = useState(false)
  const more = useConversationCopy()
  const [problem, setProblem] = useState('')
  const base = `/businesses/${encodeURIComponent(activeId ?? '')}/playbook`

  async function send(path: string, init: RequestInit, done: string, kind: 'refresh' | 'save') {
    setBusy(kind)
    setProblem('')
    setStatus(kind === 'refresh' ? t.refreshing : '')
    try {
      const view = await ws.api<PlaybookView>(path, init)
      setState({ kind: 'ready', view })
      setEditing(null)
      setStatus(done)
    } catch (error) {
      setStatus('')
      setProblem(error instanceof ApiError && error.status === 429 ? t.tooMany : t.failed)
    } finally {
      setBusy(null)
    }
  }

  const startEdit = (id: string, text: string) => {
    setEditing(id)
    setDraft(text)
  }
  const saveItem = (id: string) =>
    void send(
      id === 'summary' ? base : `${base}/items/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(id === 'summary' ? { summary: draft.trim() } : { text: draft.trim() }),
      },
      t.saved,
      'save',
    )
  const removeItem = (id: string) =>
    void send(`${base}/items/${encodeURIComponent(id)}`, { method: 'DELETE' }, t.removed, 'save')
  const setTerms = (terms: string[]) =>
    void send(base, { method: 'PATCH', body: JSON.stringify({ terms }) }, t.removed, 'save')
  const refresh = () =>
    void send(
      `${base}/regenerate?language=${encodeURIComponent(language)}`,
      { method: 'POST' },
      t.refreshed,
      'refresh',
    )

  const view = state.kind === 'ready' ? state.view : null
  const editor = (id: string) =>
    editing === id ? (
      <Editor
        key={id}
        value={draft}
        onChange={setDraft}
        onSave={() => saveItem(id)}
        onCancel={() => setEditing(null)}
        busy={busy === 'save'}
        multiline={id === 'summary'}
      />
    ) : null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      titleId={titleId}
      title={t.title}
      dirty={editing !== null}
      actions={
        view && (
          <Button
            variant="outlined"
            startIcon={<RefreshCw size={18} />}
            disabled={busy !== null}
            onClick={refresh}
          >
            {busy === 'refresh' ? t.refreshing : t.refresh}
          </Button>
        )
      }
    >
      <Box data-testid="playbook" sx={{ minWidth: { sm: 480 } }}>
        <Typography role="status" aria-live="polite" variant="bodySmall" color="text.secondary">
          {status}
        </Typography>
        {state.kind === 'loading' && (
          <Stack spacing={2} sx={{ py: 4 }}>
            <Typography variant="bodyMedium">{t.loading}</Typography>
            <LinearProgress aria-label={t.loading} sx={{ borderRadius: 1 }} />
          </Stack>
        )}
        {state.kind === 'failed' && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={retry}>
                {t.retry}
              </Button>
            }
          >
            {state.status === 429 ? t.tooMany : t.failed}
          </Alert>
        )}
        {view && (
          <Stack spacing={4}>
            <Box>
              <Typography variant="bodyMedium" color="text.secondary">
                {t.honest}
              </Typography>
              <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1 }}>
                {(view.mode === 'gemini' ? t.madeByAi : t.madeByRules)(
                  new Date(view.generated_at).toLocaleDateString(language, {
                    day: 'numeric',
                    month: 'short',
                  }),
                )}
              </Typography>
            </Box>
            {busy === 'refresh' && <LinearProgress aria-hidden="true" sx={{ borderRadius: 1 }} />}
            {problem && (
              <Alert severity={problem === t.tooMany ? 'warning' : 'error'}>{problem}</Alert>
            )}
            {view.playbook.summary && (
              <Group title={t.summary}>
                {editor('summary') ?? (
                  <Row
                    text={view.playbook.summary}
                    onEdit={() => startEdit('summary', view.playbook.summary ?? '')}
                    disabled={busy !== null}
                  />
                )}
              </Group>
            )}
            {SECTIONS.map((section) => {
              const first = FIRST_SECTIONS.has(section)
              if (!first && !showAll) return null
              const all = (view.playbook[section] ?? []) as Entry[]
              const entries = first && !showAll ? all.slice(0, FIRST_ENTRIES) : all
              if (!entries.length) return null
              return (
                <Group key={section} title={t.sections[section]} testId={`playbook-${section}`}>
                  {entries.map(
                    (entry) =>
                      editor(entry.id) ?? (
                        <Row
                          key={entry.id}
                          heading={heading(entry, t)}
                          text={entry.text}
                          meta={meta(entry, t)}
                          owner={entry.source === 'owner' ? t.yourWords : undefined}
                          onEdit={() => startEdit(entry.id, entry.text)}
                          onRemove={() => removeItem(entry.id)}
                          disabled={busy !== null}
                        />
                      ),
                  )}
                </Group>
              )
            })}
            {showAll && (view.playbook.vocabulary?.terms ?? []).length > 0 && (
              <Group title={t.words} list={false} testId="playbook-words">
                <Typography variant="bodySmall" color="text.secondary" sx={{ mb: 2 }}>
                  {t.wordsHint}
                </Typography>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
                  {(view.playbook.vocabulary?.terms ?? []).map((term, _index, terms) => (
                    <Chip
                      key={term}
                      label={term}
                      aria-label={t.removeWord(term)}
                      disabled={busy !== null}
                      onClick={() => setTerms(terms.filter((other) => other !== term))}
                      onDelete={() => setTerms(terms.filter((other) => other !== term))}
                    />
                  ))}
                </Stack>
              </Group>
            )}
            <Button
              onClick={() => setShowAll((value) => !value)}
              aria-expanded={showAll}
              data-testid="playbook-more"
              sx={{ alignSelf: 'flex-start', minHeight: 48 }}
            >
              {showAll ? more.less : more.more}
            </Button>
          </Stack>
        )}
      </Box>
    </Sheet>
  )
}

type Copy = ReturnType<typeof usePlaybookCopy>

function heading(entry: Entry, t: Copy): string | undefined {
  if ('metric' in entry) return t.metrics[entry.metric as MetricId]
  if ('feature' in entry) return t.features[(entry as Feature).feature as FeatureId]
  return undefined
}

function meta(entry: Entry, t: Copy): string | undefined {
  if (!('metric' in entry)) return undefined
  return ON_TODAY.has(entry.metric as MetricId) ? t.onToday : t.notTracked
}

function Group({
  title,
  children,
  testId,
  list = true,
}: {
  title: string
  children: ReactNode
  testId?: string
  list?: boolean
}) {
  return (
    <Box component="section" data-testid={testId}>
      <Typography component="h3" variant="titleSmall" sx={{ mb: 1 }}>
        {title}
      </Typography>
      {list ? (
        <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {children}
        </Stack>
      ) : (
        children
      )}
    </Box>
  )
}

function Row({
  heading,
  text,
  meta,
  owner,
  onEdit,
  onRemove,
  disabled,
}: {
  heading?: string
  text: string
  meta?: string
  owner?: string
  onEdit: () => void
  onRemove?: () => void
  disabled: boolean
}) {
  const t = usePlaybookCopy()
  const roles = useTheme().material
  return (
    <Stack
      component="li"
      direction="row"
      sx={{
        alignItems: 'flex-start',
        gap: 1,
        py: 1,
        borderBottom: `1px solid ${roles.outlineVariant}`,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0, pt: 1.5, overflowWrap: 'anywhere' }}>
        {heading && (
          <Typography variant="bodyLarge" sx={{ fontWeight: 500 }}>
            {heading}
          </Typography>
        )}
        <Typography
          variant={heading ? 'bodyMedium' : 'bodyLarge'}
          color={heading ? 'text.secondary' : undefined}
        >
          {text}
        </Typography>
        {(meta || owner) && (
          <Stack direction="row" sx={{ gap: 1, mt: 1, flexWrap: 'wrap' }}>
            {owner && <Chip size="small" variant="outlined" label={owner} />}
            {meta && (
              <Typography variant="labelMedium" color="text.secondary" sx={{ alignSelf: 'center' }}>
                {meta}
              </Typography>
            )}
          </Stack>
        )}
      </Box>
      <IconButton
        aria-label={t.edit(heading ?? text)}
        onClick={onEdit}
        disabled={disabled}
        sx={{ width: 48, height: 48 }}
      >
        <Pencil size={18} />
      </IconButton>
      {onRemove && (
        <IconButton
          aria-label={t.remove(heading ?? text)}
          onClick={onRemove}
          disabled={disabled}
          sx={{ width: 48, height: 48 }}
        >
          <X size={18} />
        </IconButton>
      )}
    </Stack>
  )
}

function Editor({
  value,
  onChange,
  onSave,
  onCancel,
  busy,
  multiline,
}: {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
  busy: boolean
  multiline: boolean
}) {
  const t = usePlaybookCopy()
  const limit = multiline ? 240 : 120
  const valid = value.trim().length > 0 && value.length <= limit
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
    }
    if (event.key === 'Enter' && !event.shiftKey && valid) {
      event.preventDefault()
      onSave()
    }
  }
  return (
    <Box component="li" sx={{ py: 1 }}>
      <TextField
        fullWidth
        autoFocus
        multiline={multiline}
        label={t.editLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={keys}
        slotProps={{ htmlInput: { maxLength: limit } }}
        helperText={`${value.length}/${limit}`}
      />
      <Stack direction="row" sx={{ gap: 2, mt: 2, justifyContent: 'flex-end' }}>
        <Button onClick={onCancel} disabled={busy}>
          {t.cancel}
        </Button>
        <Button variant="contained" onClick={onSave} disabled={busy || !valid}>
          {t.save}
        </Button>
      </Stack>
    </Box>
  )
}
