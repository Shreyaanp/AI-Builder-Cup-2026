import type { Appearance } from '../design/theme'

export type Language = 'en' | 'hi'
export type Destination = 'coach' | 'business' | 'activity'
export type Segment = 'grocery' | 'tea' | 'bakery'
export type BusinessFields = {
  name: string
  category: string
  location: string
  hours: string
  phone: string
}
export type BusinessState = {
  fields: BusinessFields
  revision: number
  reviewedRevision: number | null
  note: string
  events: string[]
}
export type BusinessAction =
  | { type: 'example'; segment: Segment }
  | { type: 'edit'; fields: BusinessFields }
  | { type: 'note'; text: string }
  | { type: 'review'; revision: number }
  | { type: 'reset' }
export type Preferences = { language: Language; appearance: Appearance; destination: Destination }
export type PreferencesAction =
  | { type: 'language'; language: Language }
  | { type: 'appearance'; appearance: Appearance }
  | { type: 'destination'; destination: Destination }
export const initialBusiness: BusinessState = {
  fields: { name: '', category: '', location: '', hours: '', phone: '' },
  revision: 0,
  reviewedRevision: null,
  note: '',
  events: [],
}

const examples: Record<Segment, BusinessFields> = {
  grocery: {
    name: 'Neighbourhood Pantry',
    category: 'Grocery shop',
    location: 'Pune',
    hours: '8 AM–9 PM',
    phone: '',
  },
  tea: {
    name: 'Little Chai Corner',
    category: 'Tea & snacks',
    location: 'Pune',
    hours: '7 AM–7 PM',
    phone: '',
  },
  bakery: {
    name: 'Morning Crumb',
    category: 'Neighbourhood bakery',
    location: 'Pune',
    hours: '8 AM–8 PM',
    phone: '',
  },
}
export function businessReducer(state: BusinessState, action: BusinessAction): BusinessState {
  switch (action.type) {
    case 'example':
      return {
        ...state,
        fields: { ...examples[action.segment] },
        revision: state.revision + 1,
        reviewedRevision: null,
        events: ['Fictional example loaded', ...state.events].slice(0, 10),
      }
    case 'edit':
      return {
        ...state,
        fields: action.fields,
        revision: state.revision + 1,
        reviewedRevision: null,
        events: ['Business details edited', ...state.events].slice(0, 10),
      }
    case 'note':
      return {
        ...state,
        note: action.text,
        events: ['Private note added', ...state.events].slice(0, 10),
      }
    case 'review':
      return action.revision === state.revision &&
        state.fields.name.trim() &&
        state.fields.location.trim()
        ? {
            ...state,
            reviewedRevision: state.revision,
            events: ['Details reviewed for this session', ...state.events].slice(0, 10),
          }
        : state
    case 'reset':
      return initialBusiness
  }
}
export function preferencesReducer(state: Preferences, action: PreferencesAction): Preferences {
  switch (action.type) {
    case 'language':
      return { ...state, language: action.language }
    case 'appearance':
      return { ...state, appearance: action.appearance }
    case 'destination':
      return { ...state, destination: action.destination }
  }
}
