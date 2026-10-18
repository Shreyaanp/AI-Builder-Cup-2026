import { Box, Paper, Stack, Typography, useTheme } from '@mui/material'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { shape, windowClass } from '../design/theme'
import { adaptSteps, edges, lanes, scaleFacts } from './diagram'

const titles = new Map(lanes.flatMap((lane) => lane.nodes.map((node) => [node.id, node.title])))

/** /architecture on any host: the production diagram for judges, readable on a phone. */
export default function ArchitecturePage() {
  const roles = useTheme().material
  const grid = {
    display: 'grid',
    gap: 1.5,
    gridTemplateColumns: '1fr',
    [`@media (min-width: ${windowClass.medium}px)`]: { gridTemplateColumns: '1fr 1fr' },
  }
  return (
    <Box
      component="main"
      sx={{
        maxWidth: 960,
        mx: 'auto',
        px: 2,
        pt: 'max(24px, env(safe-area-inset-top))',
        pb: 'max(32px, env(safe-area-inset-bottom))',
        overflowX: 'clip',
      }}
    >
      <Typography variant="headlineMedium" component="h1">
        How Chalkboard works
      </Typography>
      <Typography variant="bodyLarge" sx={{ mt: 1, color: roles.onSurfaceVariant }}>
        What runs in production today, from the phone to Google AI. Arrows show who calls whom.
      </Typography>

      <Typography variant="titleLarge" component="h2" sx={{ mt: 4, mb: 2 }}>
        What runs
      </Typography>
      <Stack spacing={1} component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {lanes.map((lane, index) => (
          <Box component="li" key={lane.id}>
            {index > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', color: roles.outline, pb: 1 }}>
                <ArrowDown size={20} aria-hidden />
              </Box>
            )}
            <Paper
              variant="outlined"
              data-testid={`lane-${lane.id}`}
              sx={{ p: 2, borderRadius: `${shape.lg}px`, bgcolor: roles.surfaceContainerLow }}
            >
              <Typography
                variant="labelLarge"
                component="h3"
                sx={{ color: roles.primary, mb: 1.5 }}
              >
                {lane.title}
              </Typography>
              <Box component="ul" sx={{ ...grid, listStyle: 'none', p: 0, m: 0 }}>
                {lane.nodes.map((node) => {
                  const calls = edges.filter((edge) => edge.from === node.id)
                  return (
                    <Box
                      component="li"
                      key={node.id}
                      sx={{
                        p: 1.5,
                        borderRadius: `${shape.md}px`,
                        bgcolor: roles.surfaceContainerHigh,
                        minWidth: 0,
                      }}
                    >
                      <Typography variant="titleSmall" component="p">
                        {node.title}
                      </Typography>
                      <Typography
                        variant="bodySmall"
                        component="p"
                        sx={{ color: roles.onSurfaceVariant, overflowWrap: 'anywhere' }}
                      >
                        {node.detail}
                      </Typography>
                      {calls.length > 0 && (
                        <Box
                          component="ul"
                          aria-label={`${node.title} calls`}
                          sx={{ listStyle: 'none', p: 0, m: 0, mt: 1 }}
                        >
                          {calls.map((edge) => (
                            <Typography
                              key={edge.to}
                              component="li"
                              variant="labelMedium"
                              sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}
                            >
                              <ArrowRight size={14} aria-hidden style={{ flexShrink: 0 }} />
                              <span>
                                {titles.get(edge.to)}
                                {edge.label ? ` (${edge.label})` : ''}
                              </span>
                            </Typography>
                          ))}
                        </Box>
                      )}
                    </Box>
                  )
                })}
              </Box>
            </Paper>
          </Box>
        ))}
      </Stack>

      <Typography variant="titleLarge" component="h2" sx={{ mt: 5, mb: 2 }}>
        How the AI adapts to any business
      </Typography>
      <Box component="ol" sx={{ ...grid, listStyle: 'none', p: 0, m: 0 }}>
        {adaptSteps.map((step, index) => (
          <Paper
            key={step.title}
            component="li"
            variant="outlined"
            sx={{ p: 2, borderRadius: `${shape.lg}px` }}
          >
            <Typography variant="titleMedium" component="h3">
              {index + 1}. {step.title}
            </Typography>
            <Typography variant="bodyMedium" sx={{ mt: 0.5, color: roles.onSurfaceVariant }}>
              {step.detail}
            </Typography>
          </Paper>
        ))}
      </Box>

      <Typography variant="titleLarge" component="h2" sx={{ mt: 5, mb: 2 }}>
        Measured scale
      </Typography>
      <Box component="ul" sx={{ ...grid, listStyle: 'none', p: 0, m: 0 }}>
        {scaleFacts.map((fact) => (
          <Paper
            key={fact.value}
            component="li"
            sx={{ p: 2, borderRadius: `${shape.lg}px`, bgcolor: roles.primaryContainer }}
          >
            <Typography
              variant="headlineSmall"
              component="p"
              sx={{ color: roles.onPrimaryContainer }}
            >
              {fact.value}
            </Typography>
            <Typography variant="bodyMedium" sx={{ color: roles.onPrimaryContainer }}>
              {fact.label}
            </Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  )
}
