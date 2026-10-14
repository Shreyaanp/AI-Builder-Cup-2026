import type { Locale } from '../../i18n/locales'

const en = {
  pinOffer: 'This photo also has a location. Review it separately before adding a shop pin.',
  reviewPin: 'Review photo location',
  dismiss: 'Dismiss',
  galleryOffer: 'Add this photo to your shop gallery?',
  galleryNote: 'Gallery photos are visible to customers when your page is shared.',
  galleryAdd: 'Add to gallery',
  later: 'Not now',
}
const ta: typeof en = {
  pinOffer:
    'இந்தப் படத்தில் இடத் தகவலும் உள்ளது. கடையின் வரைபடப் பின்னைச் சேர்க்கத் தனியாகச் சரிபார்க்கவும்.',
  reviewPin: 'படத்தின் இடத்தைச் சரிபார்',
  dismiss: 'நீக்கு',
  galleryOffer: 'இந்தப் படத்தை உங்கள் கடையின் படத்தொகுப்பில் சேர்க்கவா?',
  galleryNote: 'பகிரப்பட்ட பக்கத்தில் படத்தொகுப்பை வாடிக்கையாளர்கள் பார்க்கலாம்.',
  galleryAdd: 'படத்தொகுப்பில் சேர்',
  later: 'இப்போது வேண்டாம்',
}
export const photoCopy = (locale: Locale) => (locale === 'ta' ? ta : en)
