import { useLocale } from '../../state/hooks'
import type { Locale } from '../../i18n/locales'

/** Grow as a short list (simplify batch 4a): the group rows and the More tools grid. */
type GrowCopy = {
  /** Prep plan and Plan tomorrow. */
  make: string
  /** Orders, Purchase orders and Supply chain. */
  stock: string
  /** Your week and Weekly recap. */
  sales: string
  moreTools: string
}

const copy: Record<Locale, GrowCopy> = {
  en: {
    make: 'How much to make',
    stock: 'Buy stock',
    sales: 'My sales',
    moreTools: 'More tools',
  },
  'zh-Hans': {
    make: '做多少',
    stock: '进货',
    sales: '我的销售',
    moreTools: '更多工具',
  },
  ms: {
    make: 'Berapa banyak nak buat',
    stock: 'Beli stok',
    sales: 'Jualan saya',
    moreTools: 'Lagi alat',
  },
  ta: {
    make: 'எவ்வளவு செய்வது',
    stock: 'சரக்கு வாங்க',
    sales: 'என் விற்பனை',
    moreTools: 'மேலும் கருவிகள்',
  },
  ja: {
    make: 'どれだけ作るか',
    stock: '仕入れ',
    sales: '売上',
    moreTools: 'その他のツール',
  },
  ko: {
    make: '얼마나 만들지',
    stock: '재료 주문',
    sales: '내 매출',
    moreTools: '더 많은 도구',
  },
  id: {
    make: 'Berapa yang dibuat',
    stock: 'Beli stok',
    sales: 'Penjualan saya',
    moreTools: 'Alat lainnya',
  },
  th: {
    make: 'ทำเท่าไหร่ดี',
    stock: 'ซื้อของเข้าร้าน',
    sales: 'ยอดขายของฉัน',
    moreTools: 'เครื่องมืออื่น',
  },
  vi: {
    make: 'Làm bao nhiêu',
    stock: 'Nhập hàng',
    sales: 'Doanh số của tôi',
    moreTools: 'Công cụ khác',
  },
  fil: {
    make: 'Gaano karami ang gagawin',
    stock: 'Bumili ng stock',
    sales: 'Benta ko',
    moreTools: 'Iba pang tool',
  },
  hi: {
    make: 'कितना बनाना है',
    stock: 'माल मँगाएँ',
    sales: 'मेरी बिक्री',
    moreTools: 'और टूल',
  },
  bn: {
    make: 'কতটা বানাবেন',
    stock: 'মাল আনান',
    sales: 'আমার বিক্রি',
    moreTools: 'আরও টুল',
  },
  te: {
    make: 'ఎంత చేయాలి',
    stock: 'సరుకు తెప్పించండి',
    sales: 'నా అమ్మకాలు',
    moreTools: 'మరిన్ని టూల్స్',
  },
  mr: {
    make: 'किती बनवायचे',
    stock: 'माल मागवा',
    sales: 'माझी विक्री',
    moreTools: 'आणखी साधने',
  },
  kn: {
    make: 'ಎಷ್ಟು ಮಾಡಬೇಕು',
    stock: 'ಸರಕು ತರಿಸಿ',
    sales: 'ನನ್ನ ಮಾರಾಟ',
    moreTools: 'ಇನ್ನಷ್ಟು ಉಪಕರಣಗಳು',
  },
}

export function useGrowCopy(): GrowCopy {
  return copy[useLocale()]
}
