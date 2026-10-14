/** Free official handoffs. Opening these links never establishes API access or ownership. */
export const OWNER_URL = 'https://business.google.com/add'

export const mapsSearch = (name: string, location: string) =>
  'https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent([name, location].filter(Boolean).join(' '))
