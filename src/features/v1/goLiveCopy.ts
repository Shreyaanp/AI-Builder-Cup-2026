import { useLocale } from '../../state/hooks'
import type { ListingField } from './goLive'

/** Go-live copy (issue #180): the review → list → congratulations path. */
interface GoLiveCopy {
  review: string
  listShop: string
  listing: string
  missingTitle: string
  missing: Record<ListingField, string>
  /** What the app says to the coach on the owner's behalf to get the missing answer. */
  ask: Record<Exclude<ListingField, 'location'>, string>
  setLocation: string
  congrats: (name: string) => string
  yourLink: string
  openShop: string
  share: string
  nextTitle: string
  addMenu: string
  setUpStamps: string
}

const copy: Record<'en' | 'hi', GoLiveCopy> = {
  en: {
    review: 'Review my shop',
    listShop: 'List my shop',
    listing: 'Listing your shop…',
    missingTitle: 'Before I can list your shop, I still need:',
    missing: { name: 'Shop name', category: 'What you sell', location: 'Where your shop is' },
    ask: {
      name: 'Ask me what my shop is called.',
      category: 'Ask me what I sell.',
    },
    setLocation: 'Set location',
    congrats: (name) => `Congratulations, ${name} is live!`,
    yourLink: 'Your shop link',
    openShop: 'Open my shop page',
    share: 'Share',
    nextTitle: 'Next steps',
    addMenu: 'Add your menu',
    setUpStamps: 'Set up stamps',
  },
  hi: {
    review: 'मेरी दुकान देखें',
    listShop: 'मेरी दुकान लिस्ट करें',
    listing: 'दुकान लिस्ट हो रही है…',
    missingTitle: 'दुकान लिस्ट करने से पहले ये चाहिए:',
    missing: { name: 'दुकान का नाम', category: 'आप क्या बेचते हैं', location: 'दुकान कहाँ है' },
    ask: {
      name: 'मुझसे पूछिए कि मेरी दुकान का नाम क्या है।',
      category: 'मुझसे पूछिए कि मैं क्या बेचता हूँ।',
    },
    setLocation: 'जगह चुनें',
    congrats: (name) => `बधाई हो, ${name} लाइव है!`,
    yourLink: 'आपकी दुकान का लिंक',
    openShop: 'मेरी दुकान का पेज खोलें',
    share: 'शेयर करें',
    nextTitle: 'अगले कदम',
    addMenu: 'मेन्यू जोड़ें',
    setUpStamps: 'स्टैम्प सेट करें',
  },
}

export function useGoLiveCopy(): GoLiveCopy {
  return useLocale() === 'hi' ? copy.hi : copy.en
}
