import { useLocale } from '../../../state/hooks'
import type { Locale } from '../../../i18n/locales'

/** Today cards on the first screen (OB-176): the two new cards and the X's name. The reasons
 * and the how-often setting load on first use (cardsMoreCopy). */
type CardsCopy = {
  hideLabel: (card: string) => string
  supplierReplied: (supplier: string, text: string) => string
  read: string
  noPrice: (n: number, item: string) => string
  addPrice: string
}

const copy: Record<Locale, CardsCopy> = {
  en: {
    hideLabel: (card) => `Hide: ${card}`,
    supplierReplied: (supplier, text) =>
      text ? `${supplier} replied: “${text}”` : `${supplier} replied`,
    read: 'Read',
    noPrice: (n, item) => (n === 1 ? `${item} has no price yet` : `${n} items have no price yet`),
    addPrice: 'Add price',
  },
  hi: {
    hideLabel: (card) => `छिपाएँ: ${card}`,
    supplierReplied: (supplier, text) =>
      text ? `${supplier} का जवाब: “${text}”` : `${supplier} ने जवाब दिया`,
    read: 'पढ़ें',
    noPrice: (n, item) =>
      n === 1 ? `${item} का दाम अभी नहीं डाला` : `${n} चीज़ों का दाम अभी नहीं डाला`,
    addPrice: 'दाम डालें',
  },
  bn: {
    hideLabel: (card) => `লুকান: ${card}`,
    supplierReplied: (supplier, text) =>
      text ? `${supplier}-এর উত্তর: “${text}”` : `${supplier} উত্তর দিয়েছে`,
    read: 'পড়ুন',
    noPrice: (n, item) =>
      n === 1 ? `${item}-এর দাম এখনও দেওয়া হয়নি` : `${n}টি জিনিসের দাম এখনও দেওয়া হয়নি`,
    addPrice: 'দাম দিন',
  },
  te: {
    hideLabel: (card) => `దాచు: ${card}`,
    supplierReplied: (supplier, text) =>
      text ? `${supplier} జవాబు: “${text}”` : `${supplier} జవాబిచ్చారు`,
    read: 'చదవండి',
    noPrice: (n, item) => (n === 1 ? `${item}కి ఇంకా ధర లేదు` : `${n} వస్తువులకు ఇంకా ధర లేదు`),
    addPrice: 'ధర చేర్చండి',
  },
  mr: {
    hideLabel: (card) => `लपवा: ${card}`,
    supplierReplied: (supplier, text) =>
      text ? `${supplier} चे उत्तर: “${text}”` : `${supplier} ने उत्तर दिले`,
    read: 'वाचा',
    noPrice: (n, item) =>
      n === 1 ? `${item} ची किंमत अजून टाकलेली नाही` : `${n} वस्तूंची किंमत अजून टाकलेली नाही`,
    addPrice: 'किंमत टाका',
  },
  kn: {
    hideLabel: (card) => `ಮರೆಮಾಡಿ: ${card}`,
    supplierReplied: (supplier, text) =>
      text ? `${supplier} ಉತ್ತರ: “${text}”` : `${supplier} ಉತ್ತರಿಸಿದ್ದಾರೆ`,
    read: 'ಓದಿ',
    noPrice: (n, item) =>
      n === 1 ? `${item}ಗೆ ಇನ್ನೂ ಬೆಲೆ ಇಲ್ಲ` : `${n} ವಸ್ತುಗಳಿಗೆ ಇನ್ನೂ ಬೆಲೆ ಇಲ್ಲ`,
    addPrice: 'ಬೆಲೆ ಸೇರಿಸಿ',
  },
  'zh-Hans': {
    hideLabel: (card) => `隐藏：${card}`,
    supplierReplied: (supplier, text) =>
      text ? `${supplier} 回复：“${text}”` : `${supplier} 已回复`,
    read: '查看',
    noPrice: (n, item) => (n === 1 ? `${item} 还没有价格` : `${n} 个商品还没有价格`),
    addPrice: '添加价格',
  },
  ms: {
    hideLabel: (card) => `Sembunyi: ${card}`,
    supplierReplied: (supplier, text) =>
      text ? `${supplier} membalas: “${text}”` : `${supplier} telah membalas`,
    read: 'Baca',
    noPrice: (n, item) => (n === 1 ? `${item} belum ada harga` : `${n} barang belum ada harga`),
    addPrice: 'Tambah harga',
  },
  ta: {
    hideLabel: (card) => `மறை: ${card}`,
    supplierReplied: (supplier, text) =>
      text ? `${supplier} பதில்: “${text}”` : `${supplier} பதிலளித்தார்`,
    read: 'படிக்கவும்',
    noPrice: (n, item) =>
      n === 1 ? `${item}க்கு இன்னும் விலை இல்லை` : `${n} பொருட்களுக்கு இன்னும் விலை இல்லை`,
    addPrice: 'விலை சேர்க்கவும்',
  },
  ja: {
    hideLabel: (card) => `非表示：${card}`,
    supplierReplied: (supplier, text) =>
      text ? `${supplier}からの返信：「${text}」` : `${supplier}から返信がありました`,
    read: '読む',
    noPrice: (n, item) =>
      n === 1 ? `${item}にまだ価格がありません` : `${n}件の商品にまだ価格がありません`,
    addPrice: '価格を追加',
  },
  ko: {
    hideLabel: (card) => `숨기기: ${card}`,
    supplierReplied: (supplier, text) =>
      text ? `${supplier} 답장: “${text}”` : `${supplier}에서 답장했어요`,
    read: '읽기',
    noPrice: (n, item) =>
      n === 1 ? `${item}에 아직 가격이 없어요` : `상품 ${n}개에 아직 가격이 없어요`,
    addPrice: '가격 추가',
  },
  id: {
    hideLabel: (card) => `Sembunyikan: ${card}`,
    supplierReplied: (supplier, text) =>
      text ? `${supplier} membalas: “${text}”` : `${supplier} sudah membalas`,
    read: 'Baca',
    noPrice: (n, item) =>
      n === 1 ? `${item} belum ada harganya` : `${n} barang belum ada harganya`,
    addPrice: 'Tambah harga',
  },
  th: {
    hideLabel: (card) => `ซ่อน: ${card}`,
    supplierReplied: (supplier, text) =>
      text ? `${supplier} ตอบว่า: “${text}”` : `${supplier} ตอบแล้ว`,
    read: 'อ่าน',
    noPrice: (n, item) => (n === 1 ? `${item} ยังไม่มีราคา` : `สินค้า ${n} รายการยังไม่มีราคา`),
    addPrice: 'ใส่ราคา',
  },
  vi: {
    hideLabel: (card) => `Ẩn: ${card}`,
    supplierReplied: (supplier, text) =>
      text ? `${supplier} trả lời: “${text}”` : `${supplier} đã trả lời`,
    read: 'Đọc',
    noPrice: (n, item) => (n === 1 ? `${item} chưa có giá` : `${n} món chưa có giá`),
    addPrice: 'Thêm giá',
  },
  fil: {
    hideLabel: (card) => `Itago: ${card}`,
    supplierReplied: (supplier, text) =>
      text ? `Sumagot si ${supplier}: “${text}”` : `Sumagot si ${supplier}`,
    read: 'Basahin',
    noPrice: (n, item) =>
      n === 1 ? `Wala pang presyo ang ${item}` : `${n} item ang wala pang presyo`,
    addPrice: 'Lagyan ng presyo',
  },
}

export function useCardsCopy(): CardsCopy {
  return copy[useLocale()] ?? copy.en
}
