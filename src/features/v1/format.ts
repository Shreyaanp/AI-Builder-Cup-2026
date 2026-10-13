const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
})

/** Prices are stored as integer paise. */
export function formatPrice(paise: number): string {
  return rupees.format(paise / 100)
}

export function formatDate(seconds: number, language: 'en' | 'hi'): string {
  return new Date(seconds * 1000).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
