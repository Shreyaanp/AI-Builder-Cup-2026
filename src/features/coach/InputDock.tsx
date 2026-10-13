import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import { ArrowUp, Camera, Mic, X } from 'lucide-react'
import { copy } from '../../design/copy'
import { useBusinessDispatch, usePreferences } from '../../state/hooks'
import { useCoachStream } from '../../hooks/useCoachStream'

export function InputDock({
  onVoice,
  onNotice,
}: {
  onVoice: () => void
  onNotice: (message: string) => void
}) {
  const dispatch = useBusinessDispatch()
  const { language } = usePreferences()
  const t = copy[language]
  const roles = useTheme().material
  const coach = useCoachStream()
  const [note, setNote] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef('')
  useEffect(
    () => () => {
      if (photoRef.current) URL.revokeObjectURL(photoRef.current)
    },
    [],
  )
  function attach(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 8 * 1024 * 1024
    ) {
      setError(t.invalidPhoto)
      return
    }
    if (photoRef.current) URL.revokeObjectURL(photoRef.current)
    const url = URL.createObjectURL(file)
    photoRef.current = url
    setError('')
    setPhotoUrl(url)
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = note.trim()
    if (!message || coach.status === 'streaming') return
    if (await coach.send(message, language)) {
      dispatch({ type: 'note', text: message })
      setNote('')
      onNotice(t.aiNotice)
    }
  }
  return (
    <Box component="section" aria-label={t.note} sx={{ mt: 5 }}>
      {coach.reply && (
        <Box aria-label="Coach response" sx={{ mb: 3, px: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1 }}>
            {coach.mode === 'offline' ? t.offlineCoach : 'Gemini coach'}
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {coach.reply}
          </Typography>
        </Box>
      )}
      <Typography role="status" variant="body2" sx={{ mb: 2 }}>
        {coach.status === 'streaming'
          ? t.replying
          : coach.status === 'cancelled'
            ? t.replyStopped
            : ''}
      </Typography>
      {coach.error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {coach.error}
        </Alert>
      )}
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      {photoUrl && (
        <Box sx={{ mb: 3, display: 'flex', gap: 3, alignItems: 'center' }}>
          <Box
            component="img"
            src={photoUrl}
            alt={t.camera}
            sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: '12px' }}
          />
          <Typography variant="body2" sx={{ flex: 1 }}>
            {t.photoNotice}
          </Typography>
          <IconButton
            aria-label={t.remove}
            onClick={() => {
              URL.revokeObjectURL(photoRef.current)
              photoRef.current = ''
              setPhotoUrl('')
            }}
          >
            <X size={20} />
          </IconButton>
        </Box>
      )}
      <Box
        component="form"
        onSubmit={(event) => {
          void send(event)
        }}
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: roles.surface,
          borderRadius: '24px',
          p: 3,
        }}
      >
        <TextField
          fullWidth
          label={t.note}
          placeholder={t.noteHint}
          multiline
          minRows={1}
          maxRows={5}
          value={note}
          disabled={coach.status === 'streaming'}
          onChange={(event) => setNote(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 600 } }}
          sx={{ mb: 2 }}
        />
        <Stack direction="row" sx={{ alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button
            startIcon={<Camera size={19} />}
            onClick={() => fileRef.current?.click()}
            sx={{ px: 3 }}
          >
            {language === 'hi' ? 'फोटो' : 'Photo'}
          </Button>
          <Button startIcon={<Mic size={19} />} onClick={onVoice} sx={{ px: 3 }}>
            {language === 'hi' ? 'बोलें' : 'Speak'}
          </Button>
          <Box sx={{ flex: 1 }} />
          {coach.status === 'streaming' && <Button onClick={coach.stop}>{t.stopReply}</Button>}
          <IconButton
            type="submit"
            aria-label={t.send}
            disabled={!note.trim() || coach.status === 'streaming'}
            sx={{ bgcolor: roles.primaryContainer, color: roles.onPrimaryContainer }}
          >
            <ArrowUp size={20} />
          </IconButton>
        </Stack>
      </Box>
      <input
        ref={fileRef}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        aria-label={t.camera}
        onChange={attach}
      />
    </Box>
  )
}
