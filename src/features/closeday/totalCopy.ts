import type { Locale } from '../../i18n/locales'

export type DayTotalCopy = {
  /** Opens the form: for an owner who does not want to enter every item. */
  open: string
  title: string
  total: string
  splitOpen: string
  cash: string
  /** Everything that isn't cash, for shops outside India. */
  online: string
  /** {sum} what cash and UPI come to, {total} the total typed. */
  mismatch: string
  /** Back to typing items. */
  itemsInstead: string
  /** On Check and after saving: what this record is, and what it can't do. */
  note: string
}

const copy: Record<Locale, DayTotalCopy> = {
  en: {
    open: 'Just enter the total',
    title: "Today's total",
    total: 'Total sales',
    splitOpen: 'Split cash and {online} (optional)',
    cash: 'Cash',
    online: 'online',
    mismatch: 'These add up to {sum}, not {total}.',
    itemsInstead: 'Type items instead',
    note: 'Saved as one total, not as items. Your prep plan needs item lines to learn from.',
  },
  'zh-Hans': {
    open: '只输入总额',
    title: '今日总额',
    total: '销售总额',
    splitOpen: '分开现金和{online}（可选）',
    cash: '现金',
    online: '线上',
    mismatch: '这些加起来是 {sum}，不是 {total}。',
    itemsInstead: '改为输入商品',
    note: '已按一个总额保存，不算作商品。备货计划需要商品明细才能学习。',
  },
  ms: {
    open: 'Masukkan jumlah sahaja',
    title: 'Jumlah hari ini',
    total: 'Jumlah jualan',
    splitOpen: 'Asingkan tunai dan {online} (pilihan)',
    cash: 'Tunai',
    online: 'dalam talian',
    mismatch: 'Ini berjumlah {sum}, bukan {total}.',
    itemsInstead: 'Taip item sahaja',
    note: 'Disimpan sebagai satu jumlah, bukan item. Pelan penyediaan perlukan baris item.',
  },
  ta: {
    open: 'மொத்தத்தை மட்டும் எழுதுங்கள்',
    title: 'இன்றைய மொத்தம்',
    total: 'மொத்த விற்பனை',
    splitOpen: 'பணம், {online} தனியாக (விருப்பம்)',
    cash: 'பணம்',
    online: 'ஆன்லைன்',
    mismatch: 'இவற்றின் கூட்டல் {sum}, {total} அல்ல.',
    itemsInstead: 'பொருட்களை எழுதுங்கள்',
    note: 'ஒரே மொத்தமாகச் சேமிக்கப்பட்டது, பொருட்களாக அல்ல. தயாரிப்புத் திட்டத்துக்கு பொருள் வரிகள் தேவை.',
  },
  ja: {
    open: '合計だけ入力',
    title: '今日の合計',
    total: '売上合計',
    splitOpen: '現金と{online}に分ける（任意）',
    cash: '現金',
    online: 'オンライン',
    mismatch: '合計は {sum} で、{total} ではありません。',
    itemsInstead: '品目を入力する',
    note: '品目ではなく合計として保存しました。仕込み計画には品目の記録が必要です。',
  },
  ko: {
    open: '합계만 입력',
    title: '오늘 합계',
    total: '총 매출',
    splitOpen: '현금과 {online} 나누기(선택)',
    cash: '현금',
    online: '온라인',
    mismatch: '합하면 {total}이 아니라 {sum}입니다.',
    itemsInstead: '품목으로 입력',
    note: '품목이 아닌 합계로 저장했어요. 준비 계획에는 품목별 기록이 필요해요.',
  },
  id: {
    open: 'Isi totalnya saja',
    title: 'Total hari ini',
    total: 'Total penjualan',
    splitOpen: 'Pisahkan tunai dan {online} (opsional)',
    cash: 'Tunai',
    online: 'online',
    mismatch: 'Jumlahnya {sum}, bukan {total}.',
    itemsInstead: 'Ketik per barang saja',
    note: 'Disimpan sebagai satu total, bukan barang. Rencana persiapan butuh rincian barang.',
  },
  th: {
    open: 'กรอกแค่ยอดรวม',
    title: 'ยอดรวมวันนี้',
    total: 'ยอดขายรวม',
    splitOpen: 'แยกเงินสดกับ{online} (ไม่บังคับ)',
    cash: 'เงินสด',
    online: 'ออนไลน์',
    mismatch: 'รวมได้ {sum} ไม่ใช่ {total}',
    itemsInstead: 'กรอกเป็นรายการแทน',
    note: 'บันทึกเป็นยอดรวม ไม่ใช่รายการสินค้า แผนเตรียมของต้องใช้ข้อมูลรายสินค้า',
  },
  vi: {
    open: 'Chỉ nhập tổng',
    title: 'Tổng hôm nay',
    total: 'Tổng doanh thu',
    splitOpen: 'Tách tiền mặt và {online} (tùy chọn)',
    cash: 'Tiền mặt',
    online: 'trực tuyến',
    mismatch: 'Các khoản này cộng lại là {sum}, không phải {total}.',
    itemsInstead: 'Nhập theo món',
    note: 'Đã lưu thành một số tổng, không phải món. Kế hoạch chuẩn bị cần số liệu theo món.',
  },
  fil: {
    open: 'Total lang ang ilagay',
    title: 'Total ngayon',
    total: 'Kabuuang benta',
    splitOpen: 'Hatiin ang cash at {online} (opsyonal)',
    cash: 'Cash',
    online: 'online',
    mismatch: 'Ang kabuuan nito ay {sum}, hindi {total}.',
    itemsInstead: 'I-type na lang ang items',
    note: 'Na-save bilang isang total, hindi items. Kailangan ng prep plan ang bawat item.',
  },
  hi: {
    open: 'सिर्फ़ कुल रकम लिखें',
    title: 'आज की कुल बिक्री',
    total: 'कुल बिक्री',
    splitOpen: 'नकद और {online} अलग करें (ज़रूरी नहीं)',
    cash: 'नकद',
    online: 'ऑनलाइन',
    mismatch: 'इनका जोड़ {sum} है, {total} नहीं।',
    itemsInstead: 'सामान के हिसाब से लिखें',
    note: 'एक कुल रकम की तरह सहेजा गया, सामान की तरह नहीं। कितना बनाना है, यह बताने के लिए सामान की लाइनें चाहिए।',
  },
  bn: {
    open: 'শুধু মোট লিখুন',
    title: 'আজকের মোট',
    total: 'মোট বিক্রি',
    splitOpen: 'নগদ ও {online} আলাদা করুন (ঐচ্ছিক)',
    cash: 'নগদ',
    online: 'অনলাইন',
    mismatch: 'এগুলোর যোগফল {sum}, {total} নয়।',
    itemsInstead: 'পণ্য ধরে লিখুন',
    note: 'একটি মোট হিসেবে সংরক্ষিত, পণ্য হিসেবে নয়। প্রস্তুতির পরিকল্পনার জন্য পণ্যের লাইন দরকার।',
  },
  te: {
    open: 'మొత్తం మాత్రమే రాయండి',
    title: 'ఈరోజు మొత్తం',
    total: 'మొత్తం అమ్మకాలు',
    splitOpen: 'నగదు, {online} వేరు చేయండి (ఐచ్ఛికం)',
    cash: 'నగదు',
    online: 'ఆన్‌లైన్',
    mismatch: 'వీటి మొత్తం {sum}, {total} కాదు.',
    itemsInstead: 'వస్తువులుగా రాయండి',
    note: 'ఒకే మొత్తంగా సేవ్ అయింది, వస్తువులుగా కాదు. తయారీ ప్రణాళికకు వస్తువుల వివరాలు కావాలి.',
  },
  mr: {
    open: 'फक्त एकूण रक्कम लिहा',
    title: 'आजची एकूण विक्री',
    total: 'एकूण विक्री',
    splitOpen: 'रोख आणि {online} वेगळे करा (ऐच्छिक)',
    cash: 'रोख',
    online: 'ऑनलाइन',
    mismatch: 'यांची बेरीज {sum} आहे, {total} नाही.',
    itemsInstead: 'वस्तूंनुसार लिहा',
    note: 'एक एकूण रक्कम म्हणून जतन केले, वस्तू म्हणून नाही. तयारीच्या योजनेला वस्तूंच्या ओळी लागतात.',
  },
  kn: {
    open: 'ಒಟ್ಟು ಮೊತ್ತ ಮಾತ್ರ ಬರೆಯಿರಿ',
    title: 'ಇಂದಿನ ಒಟ್ಟು',
    total: 'ಒಟ್ಟು ಮಾರಾಟ',
    splitOpen: 'ನಗದು ಮತ್ತು {online} ಬೇರೆ ಮಾಡಿ (ಐಚ್ಛಿಕ)',
    cash: 'ನಗದು',
    online: 'ಆನ್‌ಲೈನ್',
    mismatch: 'ಇವುಗಳ ಒಟ್ಟು {sum}, {total} ಅಲ್ಲ.',
    itemsInstead: 'ವಸ್ತುಗಳಾಗಿ ಬರೆಯಿರಿ',
    note: 'ಒಂದೇ ಒಟ್ಟು ಮೊತ್ತವಾಗಿ ಉಳಿಸಲಾಗಿದೆ, ವಸ್ತುಗಳಾಗಿ ಅಲ್ಲ. ತಯಾರಿ ಯೋಜನೆಗೆ ವಸ್ತುಗಳ ಸಾಲುಗಳು ಬೇಕು.',
  },
}

/** UPI is what Indian shops call it; elsewhere the word stays general. */
export function dayTotalCopy(locale: Locale, currency: string): DayTotalCopy {
  const words = copy[locale]
  const online = currency === 'INR' ? 'UPI' : words.online
  return { ...words, online, splitOpen: words.splitOpen.replace('{online}', online) }
}
