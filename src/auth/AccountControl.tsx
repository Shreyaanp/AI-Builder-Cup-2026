import { Alert, Button, Stack, Typography } from '@mui/material'
import { useIdentity } from './useIdentity'
import { usePreferences } from '../state/hooks'

export function AccountControl() {
  const identity = useIdentity()
  const { language } = usePreferences()
  if (identity.mode === 'local') return null
  return (
    <Stack sx={{ gap: 2, my: 3 }}>
      {identity.error && <Alert severity="error">{identity.error}</Alert>}
      {identity.status === 'ready' ? (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 3 }}>
          <Typography variant="body2">
            {language === 'hi'
              ? 'निजी बातचीत के लिए साइन इन है'
              : 'Signed in for private conversations'}
          </Typography>
          <Button
            onClick={() => {
              void identity.signOut()
            }}
          >
            {language === 'hi' ? 'साइन आउट' : 'Sign out'}
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
          {language === 'hi' ? 'Google से साइन इन करें' : 'Sign in with Google'}
        </Button>
      )}
    </Stack>
  )
}
