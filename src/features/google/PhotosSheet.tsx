import { useRef } from 'react'
import { Alert, Box, CircularProgress, IconButton, Stack, Typography } from '@mui/material'
import { ImagePlus, X } from 'lucide-react'
import { shape } from '../../design/theme'
import { Sheet } from '../v1/Sheet'
import { useTabsCopy } from '../v1/tabsCopy'
import { useWorkspace } from '../v1/workspaceContext'
import { fill, useGoogleCopy } from './strings'
import { GALLERY_LIMIT, useGallery } from './useGallery'

const PHOTO_TYPES = 'image/jpeg,image/png,image/webp'

/** The shop's photos in a sheet on the Shop tab: see them, add one, remove one. */
export function PhotosSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tabs = useTabsCopy()
  return (
    <Sheet open={open} onClose={onClose} titleId="photos-sheet-title" title={tabs.photos}>
      {open && <PhotosBody />}
    </Sheet>
  )
}

function PhotosBody() {
  const g = useGoogleCopy()
  const ws = useWorkspace()
  const gallery = useGallery()
  const upload = useRef<HTMLInputElement>(null)
  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void gallery.add(file)
  }
  // The demo keeps its sample photos: a pick says so instead of uploading.
  const add = () => (ws.readOnlyMessage ? ws.notify(ws.readOnlyMessage) : upload.current?.click())
  return (
    <Stack spacing={3}>
      <Typography variant="bodyMedium" color="text.secondary">
        {g.photosTip}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2 }}>
        {gallery.ids.map((id, index) => (
          <Box
            key={id}
            sx={{
              position: 'relative',
              aspectRatio: '1 / 1',
              borderRadius: `${shape.md}px`,
              overflow: 'hidden',
              bgcolor: (theme) => theme.material.surfaceContainerHigh,
            }}
          >
            {gallery.urls[id] && (
              <Box
                component="img"
                src={gallery.urls[id]}
                alt=""
                sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            )}
            {!ws.readOnlyMessage && (
              <IconButton
                aria-label={fill(g.removePhoto, { n: index + 1 })}
                onClick={() => void gallery.remove(id)}
                sx={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bgcolor: 'rgba(0,0,0,0.55)',
                  color: '#fff',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                }}
              >
                <X size={16} />
              </IconButton>
            )}
          </Box>
        ))}
        {!gallery.full && (
          <Box
            component="button"
            type="button"
            onClick={add}
            disabled={gallery.busy}
            aria-label={g.addPhoto}
            sx={{
              all: 'unset',
              cursor: 'pointer',
              aspectRatio: '1 / 1',
              borderRadius: `${shape.md}px`,
              border: (theme) => `2px dashed ${theme.material.outlineVariant}`,
              display: 'grid',
              placeItems: 'center',
              color: (theme) => theme.material.primary,
              '&:focus-visible': { outline: (theme) => `3px solid ${theme.material.primary}` },
            }}
          >
            {gallery.busy ? <CircularProgress size={24} /> : <ImagePlus size={28} />}
          </Box>
        )}
      </Box>
      <Typography variant="bodySmall" color="text.secondary" aria-live="polite">
        {gallery.busy
          ? g.adding
          : fill(g.photosCount, { n: gallery.ids.length, max: GALLERY_LIMIT })}
      </Typography>
      {gallery.failed && <Alert severity="error">{g.photoFailed}</Alert>}
      <input ref={upload} type="file" accept={PHOTO_TYPES} hidden onChange={pick} />
    </Stack>
  )
}
