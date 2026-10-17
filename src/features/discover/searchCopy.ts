import type { Locale } from '../../i18n/locales'
import { useLocale } from '../../state/hooks'

/** Words for the shared search engine: why a pick is personal, and "Similar nearby". */
const en = {
  becauseLiked: 'Because you liked {item} at {shop}',
  becauseLike: 'Because you like {shop}',
  becauseStamped: 'One of your regular spots',
  becauseOpened: 'You looked at this before',
  becauseAsked: 'Because you searched “{query}”',
  similarTitle: 'Similar nearby',
  likeThisShop: 'Like this shop',
  similarNone: 'Nothing similar nearby yet.',
  googleRating: '{rating} ★ · {count} reviews on Google',
}

export type SearchCopy = typeof en

const translations: Record<Exclude<Locale, 'en'>, SearchCopy> = {
  'zh-Hans': {
    becauseLiked: '因为你喜欢{shop}的{item}',
    becauseLike: '因为你喜欢{shop}',
    becauseStamped: '你常来的店',
    becauseOpened: '你之前看过这家',
    becauseAsked: '因为你搜索过“{query}”',
    similarTitle: '附近类似的店',
    likeThisShop: '像这家店',
    similarNone: '附近还没有类似的店。',
    googleRating: '{rating} ★ · Google 上 {count} 条评价',
  },
  ms: {
    becauseLiked: 'Kerana anda suka {item} di {shop}',
    becauseLike: 'Kerana anda suka {shop}',
    becauseStamped: 'Antara tempat biasa anda',
    becauseOpened: 'Anda pernah melihat kedai ini',
    becauseAsked: 'Kerana anda mencari “{query}”',
    similarTitle: 'Serupa berdekatan',
    likeThisShop: 'Seperti kedai ini',
    similarNone: 'Belum ada yang serupa berdekatan.',
    googleRating: '{rating} ★ · {count} ulasan di Google',
  },
  ta: {
    becauseLiked: '{shop} இல் {item} உங்களுக்குப் பிடித்ததால்',
    becauseLike: 'உங்களுக்கு {shop} பிடிக்கும் என்பதால்',
    becauseStamped: 'நீங்கள் அடிக்கடி வரும் இடம்',
    becauseOpened: 'இதை முன்பு பார்த்தீர்கள்',
    becauseAsked: '“{query}” என்று தேடியதால்',
    similarTitle: 'அருகில் இதுபோன்றவை',
    likeThisShop: 'இந்தக் கடை போல',
    similarNone: 'அருகில் இதுபோல் இன்னும் இல்லை.',
    googleRating: '{rating} ★ · Google இல் {count} மதிப்புரைகள்',
  },
  ja: {
    becauseLiked: '{shop}の{item}がお気に入りだったので',
    becauseLike: '{shop}がお気に入りなので',
    becauseStamped: 'いつも行くお店',
    becauseOpened: '前に見たお店',
    becauseAsked: '「{query}」を探していたので',
    similarTitle: '近くの似たお店',
    likeThisShop: 'このお店に似た',
    similarNone: '近くに似たお店はまだありません。',
    googleRating: '{rating} ★ · Google のクチコミ {count} 件',
  },
  ko: {
    becauseLiked: '{shop}의 {item}을(를) 좋아하셔서',
    becauseLike: '{shop}을(를) 좋아하셔서',
    becauseStamped: '자주 가는 곳',
    becauseOpened: '전에 본 곳',
    becauseAsked: '“{query}”을(를) 찾으셔서',
    similarTitle: '근처 비슷한 곳',
    likeThisShop: '이 가게와 비슷한',
    similarNone: '근처에 아직 비슷한 곳이 없어요.',
    googleRating: '{rating} ★ · Google 리뷰 {count}개',
  },
  id: {
    becauseLiked: 'Karena kamu suka {item} di {shop}',
    becauseLike: 'Karena kamu suka {shop}',
    becauseStamped: 'Tempat langgananmu',
    becauseOpened: 'Pernah kamu lihat',
    becauseAsked: 'Karena kamu mencari “{query}”',
    similarTitle: 'Serupa di dekatmu',
    likeThisShop: 'Mirip toko ini',
    similarNone: 'Belum ada yang mirip di dekatmu.',
    googleRating: '{rating} ★ · {count} ulasan di Google',
  },
  th: {
    becauseLiked: 'เพราะคุณชอบ{item}ที่{shop}',
    becauseLike: 'เพราะคุณชอบ{shop}',
    becauseStamped: 'ร้านประจำของคุณ',
    becauseOpened: 'คุณเคยดูร้านนี้',
    becauseAsked: 'เพราะคุณค้นหา “{query}”',
    similarTitle: 'ร้านคล้ายกันใกล้ๆ',
    likeThisShop: 'คล้ายร้านนี้',
    similarNone: 'ยังไม่มีร้านคล้ายกันใกล้ๆ',
    googleRating: '{rating} ★ · {count} รีวิวบน Google',
  },
  vi: {
    becauseLiked: 'Vì bạn thích {item} ở {shop}',
    becauseLike: 'Vì bạn thích {shop}',
    becauseStamped: 'Quán quen của bạn',
    becauseOpened: 'Bạn từng xem quán này',
    becauseAsked: 'Vì bạn đã tìm “{query}”',
    similarTitle: 'Quán tương tự gần đây',
    likeThisShop: 'Giống quán này',
    similarNone: 'Chưa có quán tương tự gần đây.',
    googleRating: '{rating} ★ · {count} đánh giá trên Google',
  },
  fil: {
    becauseLiked: 'Dahil nagustuhan mo ang {item} sa {shop}',
    becauseLike: 'Dahil gusto mo ang {shop}',
    becauseStamped: 'Isa sa mga suki mong puwesto',
    becauseOpened: 'Tiningnan mo na ito dati',
    becauseAsked: 'Dahil hinanap mo ang “{query}”',
    similarTitle: 'Kahawig sa malapit',
    likeThisShop: 'Katulad ng tindahang ito',
    similarNone: 'Wala pang kahawig sa malapit.',
    googleRating: '{rating} ★ · {count} review sa Google',
  },
  hi: {
    becauseLiked: 'क्योंकि आपको {shop} में {item} पसंद आया',
    becauseLike: 'क्योंकि आपको {shop} पसंद है',
    becauseStamped: 'आपकी रोज़ की जगह',
    becauseOpened: 'आपने इसे पहले देखा था',
    becauseAsked: 'क्योंकि आपने “{query}” खोजा था',
    similarTitle: 'आस-पास ऐसी ही जगहें',
    likeThisShop: 'इस दुकान जैसी',
    similarNone: 'आस-पास अभी ऐसा कुछ नहीं है।',
    googleRating: '{rating} ★ · Google पर {count} समीक्षाएँ',
  },
  bn: {
    becauseLiked: 'কারণ আপনার {shop}-এর {item} ভালো লেগেছিল',
    becauseLike: 'কারণ আপনার {shop} ভালো লাগে',
    becauseStamped: 'আপনার নিয়মিত জায়গা',
    becauseOpened: 'আপনি আগে এটি দেখেছিলেন',
    becauseAsked: 'কারণ আপনি “{query}” খুঁজেছিলেন',
    similarTitle: 'কাছাকাছি এমন জায়গা',
    likeThisShop: 'এই দোকানের মতো',
    similarNone: 'কাছাকাছি এখনও এমন কিছু নেই।',
    googleRating: '{rating} ★ · Google-এ {count}টি রিভিউ',
  },
  te: {
    becauseLiked: '{shop}లో {item} మీకు నచ్చింది కాబట్టి',
    becauseLike: 'మీకు {shop} నచ్చుతుంది కాబట్టి',
    becauseStamped: 'మీరు తరచుగా వెళ్లే చోటు',
    becauseOpened: 'మీరు ఇది ముందు చూశారు',
    becauseAsked: '“{query}” కోసం వెతికారు కాబట్టి',
    similarTitle: 'దగ్గర్లో ఇలాంటివి',
    likeThisShop: 'ఈ షాపు లాంటివి',
    similarNone: 'దగ్గర్లో ఇంకా ఇలాంటివి లేవు.',
    googleRating: '{rating} ★ · Google లో {count} సమీక్షలు',
  },
  mr: {
    becauseLiked: 'कारण तुम्हाला {shop} मधील {item} आवडले',
    becauseLike: 'कारण तुम्हाला {shop} आवडते',
    becauseStamped: 'तुमची नेहमीची जागा',
    becauseOpened: 'तुम्ही हे आधी पाहिले होते',
    becauseAsked: 'कारण तुम्ही “{query}” शोधले होते',
    similarTitle: 'जवळपास अशाच जागा',
    likeThisShop: 'या दुकानासारखी',
    similarNone: 'जवळपास अजून असे काही नाही.',
    googleRating: '{rating} ★ · Google वर {count} परीक्षणे',
  },
  kn: {
    becauseLiked: '{shop} ನಲ್ಲಿ {item} ನಿಮಗೆ ಇಷ್ಟವಾದ ಕಾರಣ',
    becauseLike: 'ನಿಮಗೆ {shop} ಇಷ್ಟವಾದ ಕಾರಣ',
    becauseStamped: 'ನೀವು ಆಗಾಗ ಹೋಗುವ ಜಾಗ',
    becauseOpened: 'ನೀವು ಇದನ್ನು ಹಿಂದೆ ನೋಡಿದ್ದೀರಿ',
    becauseAsked: '“{query}” ಹುಡುಕಿದ್ದರಿಂದ',
    similarTitle: 'ಹತ್ತಿರದ ಇದೇ ರೀತಿಯವು',
    likeThisShop: 'ಈ ಅಂಗಡಿಯಂತೆ',
    similarNone: 'ಹತ್ತಿರದಲ್ಲಿ ಇನ್ನೂ ಇಂಥದ್ದು ಇಲ್ಲ.',
    googleRating: '{rating} ★ · Google ನಲ್ಲಿ {count} ವಿಮರ್ಶೆಗಳು',
  },
}

export function searchCopy(locale: Locale): SearchCopy {
  return locale === 'en' ? en : translations[locale]
}

export function useSearchCopy(): SearchCopy {
  return searchCopy(useLocale())
}

type Because = {
  kind: 'followed' | 'stamped' | 'opened' | 'asked' | 'like_stamped' | 'like_followed'
  shop?: string | null
  item?: string | null
  query?: string | null
}

const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)

/** "Because you liked filter coffee at Sharma's", from the pick's facts, in any language.
 *  Followed shops use the existing "You follow this" label, so this returns null for them. */
export function becauseLine(because: Because, copy: SearchCopy): string | null {
  const shop = (because.shop ?? '').replace(/\s*\(Demo\)$/, '')
  switch (because.kind) {
    case 'stamped':
      return copy.becauseStamped
    case 'opened':
      return copy.becauseOpened
    case 'asked':
      return because.query ? fill(copy.becauseAsked, { query: because.query.slice(0, 40) }) : null
    case 'like_stamped':
    case 'like_followed':
      if (!shop) return null
      return because.item
        ? fill(copy.becauseLiked, { item: because.item, shop })
        : fill(copy.becauseLike, { shop })
    default:
      return null
  }
}

export function ratingLine(rating: number, count: number, locale: string, copy: SearchCopy) {
  return fill(copy.googleRating, {
    rating: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(rating),
    count: new Intl.NumberFormat(locale).format(count),
  })
}
