import { Alert, Button, Stack, Typography } from '@mui/material'
import { useIdentity } from './useIdentity'

export function AccountControl() {
  const identity = useIdentity()
  if (identity.mode === 'local') return null
  return (
    <Stack sx={{ gap: 2, my: 3 }}>
      {identity.error && <Alert severity="error">{identity.error}</Alert>}
      {identity.status === 'ready' ? (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 3 }}>
          <Typography variant="body2">{'Signed in for private conversations'}</Typography>
          <Button
            onClick={() => {
              void identity.signOut()
            }}
          >
            {'Sign out'}
          </Button>
        </Stack>
      ) : (
        <Button
          variant="outlined"
          disabled={identity.status === 'loading' || identity.status === 'error'}
          onClick={() => {
            void identity.signIn()
          }}
          sx={{ alignSelf: 'flex-start' }}
        >
          {'Sign in with Google'}
        </Button>
      )}
    </Stack>
  )
}
