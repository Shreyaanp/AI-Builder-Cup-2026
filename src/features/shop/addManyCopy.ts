import type { Locale } from '../../i18n/locales'
import { useLocale } from '../../state/hooks'

/** Adding several items in one go, and the "Change a price" sheet (persona runs, 8 Nov). */
export type AddManyCopy = {
  addAnother: string
  /** Heading over the items waiting to be checked. {n} how many. */
  waiting: string
  /** A waiting item's remove button. */
  remove: string
  priceHint: string
  findItem: string
  noMatch: string
}

const copy: Record<Locale, AddManyCopy> = {
  en: {
    addAnother: 'Add another',
    waiting: 'Ready to check ({n})',
    remove: 'Remove',
    priceHint: 'Tap a price to change it.',
    findItem: 'Find an item',
    noMatch: 'No item has that name.',
  },
  'zh-Hans': {
    addAnother: '再加一个',
    waiting: '待确认（{n}）',
    remove: '移除',
    priceHint: '点价格即可修改。',
    findItem: '查找商品',
    noMatch: '没有这个名称的商品。',
  },
  ms: {
    addAnother: 'Tambah lagi',
    waiting: 'Sedia untuk disemak ({n})',
    remove: 'Buang',
    priceHint: 'Ketik harga untuk menukarnya.',
    findItem: 'Cari item',
    noMatch: 'Tiada item dengan nama itu.',
  },
  ta: {
    addAnother: 'இன்னொன்று சேர்',
    waiting: 'சரிபார்க்க தயார் ({n})',
    remove: 'நீக்கு',
    priceHint: 'விலையை மாற்ற அதைத் தட்டுங்கள்.',
    findItem: 'பொருளைத் தேடு',
    noMatch: 'அந்தப் பெயரில் பொருள் இல்லை.',
  },
  ja: {
    addAnother: 'もう1つ追加',
    waiting: '確認待ち（{n}）',
    remove: '削除',
    priceHint: '価格をタップして変更します。',
    findItem: '品目を探す',
    noMatch: 'その名前の品目はありません。',
  },
  ko: {
    addAnother: '하나 더 추가',
    waiting: '확인 대기({n})',
    remove: '삭제',
    priceHint: '가격을 누르면 바꿀 수 있어요.',
    findItem: '품목 찾기',
    noMatch: '그 이름의 품목이 없어요.',
  },
  id: {
    addAnother: 'Tambah lagi',
    waiting: 'Siap diperiksa ({n})',
    remove: 'Hapus',
    priceHint: 'Ketuk harga untuk mengubahnya.',
    findItem: 'Cari barang',
    noMatch: 'Tidak ada barang dengan nama itu.',
  },
  th: {
    addAnother: 'เพิ่มอีก',
    waiting: 'รอตรวจสอบ ({n})',
    remove: 'ลบ',
    priceHint: 'แตะราคาเพื่อเปลี่ยน',
    findItem: 'ค้นหาสินค้า',
    noMatch: 'ไม่มีสินค้าชื่อนี้',
  },
  vi: {
    addAnother: 'Thêm món khác',
    waiting: 'Sẵn sàng kiểm tra ({n})',
    remove: 'Xóa',
    priceHint: 'Chạm vào giá để đổi.',
    findItem: 'Tìm món',
    noMatch: 'Không có món nào tên như vậy.',
  },
  fil: {
    addAnother: 'Magdagdag pa',
    waiting: 'Handa nang i-check ({n})',
    remove: 'Alisin',
    priceHint: 'I-tap ang presyo para baguhin.',
    findItem: 'Maghanap ng item',
    noMatch: 'Walang item na may ganyang pangalan.',
  },
  hi: {
    addAnother: 'एक और जोड़ें',
    waiting: 'जाँच के लिए तैयार ({n})',
    remove: 'हटाएँ',
    priceHint: 'दाम बदलने के लिए उस पर टैप करें।',
    findItem: 'सामान ढूँढें',
    noMatch: 'इस नाम का कोई सामान नहीं है।',
  },
  bn: {
    addAnother: 'আরও একটি যোগ করুন',
    waiting: 'যাচাইয়ের জন্য প্রস্তুত ({n})',
    remove: 'সরান',
    priceHint: 'দাম বদলাতে তাতে ট্যাপ করুন।',
    findItem: 'পণ্য খুঁজুন',
    noMatch: 'এই নামে কোনো পণ্য নেই।',
  },
  te: {
    addAnother: 'మరొకటి జోడించండి',
    waiting: 'తనిఖీకి సిద్ధం ({n})',
    remove: 'తీసివేయండి',
    priceHint: 'ధర మార్చడానికి దాన్ని నొక్కండి.',
    findItem: 'వస్తువు వెతకండి',
    noMatch: 'ఆ పేరుతో వస్తువు లేదు.',
  },
  mr: {
    addAnother: 'आणखी एक जोडा',
    waiting: 'तपासायला तयार ({n})',
    remove: 'काढा',
    priceHint: 'किंमत बदलण्यासाठी तिच्यावर टॅप करा.',
    findItem: 'वस्तू शोधा',
    noMatch: 'या नावाची वस्तू नाही.',
  },
  kn: {
    addAnother: 'ಇನ್ನೊಂದು ಸೇರಿಸಿ',
    waiting: 'ಪರಿಶೀಲನೆಗೆ ಸಿದ್ಧ ({n})',
    remove: 'ತೆಗೆದುಹಾಕಿ',
    priceHint: 'ಬೆಲೆ ಬದಲಿಸಲು ಅದನ್ನು ಟ್ಯಾಪ್ ಮಾಡಿ.',
    findItem: 'ವಸ್ತು ಹುಡುಕಿ',
    noMatch: 'ಆ ಹೆಸರಿನ ವಸ್ತು ಇಲ್ಲ.',
  },
}

export function useAddManyCopy(): AddManyCopy {
  return copy[useLocale()]
}
