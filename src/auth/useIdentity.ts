import { useContext } from 'react'
import { IdentityContext } from './context'

export function useIdentity() {
  const identity = useContext(IdentityContext)
  if (!identity) throw new Error('Identity provider is missing.')
  return identity
}
