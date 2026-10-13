import { createContext } from 'react'
import type { Dispatch } from 'react'
import type { BusinessAction, BusinessState, Preferences, PreferencesAction } from './model'

export const BusinessContext = createContext<BusinessState | null>(null)
export const BusinessDispatchContext = createContext<Dispatch<BusinessAction> | null>(null)
export const PreferencesContext = createContext<Preferences | null>(null)
export const PreferencesDispatchContext = createContext<Dispatch<PreferencesAction> | null>(null)
