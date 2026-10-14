import { Box, Button, Stack, Typography, useTheme } from '@mui/material'
import { ArrowRight, Camera, Globe, PencilLine, Share2 } from 'lucide-react'
import type { ReactElement } from 'react'
import { LoadError } from './LoadError'
import { useCopy } from './strings'
import type { Copy } from './strings'
import { useWorkspace } from './workspaceContext'
import type { Workspace } from './workspaceContext'
import { shape } from '../../design/theme'

interface Step {
  id: string
  title: string
  body: string
  action: string
  icon: ReactElement
  run: () => void
}

/** The single most useful next step for this shop — never a list of chores. */
function nextStep(ws: Workspace, t: Copy): Step {
  const shop = ws.active
  if (!shop)
    return {
      id: 'scan',
      title: t.nextScan,
      body: t.nextScanBody,
      action: t.nextScanAction,
      icon: <Camera size={20} />,
      run: ws.requestPhoto,
    }
  if (ws.products.length === 0)
    return {
      id: 'prices',
      title: t.nextPrices,
      body: t.nextPricesBody,
      action: t.nextPricesAction,
      icon: <Camera size={20} />,
      run: ws.requestPhoto,
    }
  const missing = (['hours', 'location', 'phone', 'category'] as const).find(
    (key) => !shop.fields[key].trim(),
  )
  if (missing)
    return {
      id: 'field-' + missing,
      title: t.nextField(t.fields[missing]),
      body: t.nextFieldBody,
      action: t.nextFieldAction,
      icon: <PencilLine size={20} />,
      run: () => ws.openEditor({ kind: 'business', fields: shop.fields }),
    }
  if (!shop.public)
    return {
      id: 'share',
      title: t.nextShare,
      body: t.nextShareBody,
      action: t.nextShareAction,
      icon: <Share2 size={20} />,
      run: () => ws.go('shop'),
    }
  return {
    id: 'google',
    title: t.nextGoogle,
    body: t.nextGoogleBody,
    action: t.nextGoogleAction,
    icon: <Globe size={20} />,
    run: () => ws.go('google'),
  }
}

export function NextAction() {
  const t = useCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  if (ws.loading) return null
  if (ws.loadError) return <LoadError />
  const step = nextStep(ws, t)
  return (
    <Box
      component="section"
      aria-labelledby="next-step-title"
      data-step={step.id}
      sx={{
        bgcolor: roles.secondaryContainer,
        color: roles.onSecondaryContainer,
        borderRadius: `${shape.xl}px`,
        p: 3,
      }}
    >
      <Typography variant="labelMedium">{t.nextLabel}</Typography>
      <Typography id="next-step-title" component="h2" variant="titleLarge" sx={{ mt: 0.5 }}>
        {step.title}
      </Typography>
      <Typography variant="bodyMedium" sx={{ mt: 0.5 }}>
        {step.body}
      </Typography>
      <Stack direction="row" sx={{ mt: 2 }}>
        <Button
          variant="contained"
          startIcon={step.icon}
          endIcon={<ArrowRight size={18} />}
          onClick={step.run}
        >
          {step.action}
        </Button>
      </Stack>
    </Box>
  )
}
