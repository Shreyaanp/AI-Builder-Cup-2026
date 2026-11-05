import { useLocale } from '../../state/hooks'
import type { Locale } from '../../i18n/locales'

/** Screen entries for features that used to be chat-only (simplify batch 2). */
type TwoPathsCopy = {
  closedToday: string
  closedTodayHint: string
  findSupplier: string
  supplierNeed: string
}

const copy: Record<Locale, TwoPathsCopy> = {
  en: {
    closedToday: 'Closed today',
    closedTodayHint: 'Customers see you closed until tomorrow. Your weekly hours stay the same.',
    findSupplier: 'Find a supplier',
    supplierNeed: 'What do you need?',
  },
  'zh-Hans': {
    closedToday: '今天休息',
    closedTodayHint: '顾客会看到你今天休息，直到明天。每周营业时间不变。',
    findSupplier: '找供应商',
    supplierNeed: '你需要什么？',
  },
  ms: {
    closedToday: 'Tutup hari ini',
    closedTodayHint: 'Pelanggan nampak kedai tutup hingga esok. Waktu mingguan anda kekal.',
    findSupplier: 'Cari pembekal',
    supplierNeed: 'Apa yang anda perlukan?',
  },
  ta: {
    closedToday: 'இன்று மூடல்',
    closedTodayHint:
      'நாளை வரை கடை மூடியிருப்பதாக வாடிக்கையாளர்கள் பார்ப்பார்கள். வாராந்திர நேரம் மாறாது.',
    findSupplier: 'சப்ளையரைத் தேடு',
    supplierNeed: 'உங்களுக்கு என்ன வேண்டும்?',
  },
  ja: {
    closedToday: '今日は休み',
    closedTodayHint: 'お客様には明日まで休みと表示されます。毎週の営業時間は変わりません。',
    findSupplier: '仕入れ先を探す',
    supplierNeed: '何が必要ですか？',
  },
  ko: {
    closedToday: '오늘 휴무',
    closedTodayHint: '손님에게 내일까지 휴무로 보입니다. 주간 영업시간은 그대로입니다.',
    findSupplier: '공급업체 찾기',
    supplierNeed: '무엇이 필요하세요?',
  },
  id: {
    closedToday: 'Tutup hari ini',
    closedTodayHint: 'Pelanggan melihat toko tutup sampai besok. Jam mingguan Anda tetap.',
    findSupplier: 'Cari pemasok',
    supplierNeed: 'Apa yang Anda butuhkan?',
  },
  th: {
    closedToday: 'วันนี้ปิด',
    closedTodayHint: 'ลูกค้าจะเห็นว่าร้านปิดจนถึงพรุ่งนี้ เวลาเปิดประจำสัปดาห์ไม่เปลี่ยน',
    findSupplier: 'หาซัพพลายเออร์',
    supplierNeed: 'คุณต้องการอะไร?',
  },
  vi: {
    closedToday: 'Hôm nay nghỉ',
    closedTodayHint: 'Khách thấy quán nghỉ đến ngày mai. Giờ mở cửa hằng tuần không đổi.',
    findSupplier: 'Tìm nhà cung cấp',
    supplierNeed: 'Bạn cần gì?',
  },
  fil: {
    closedToday: 'Sarado ngayon',
    closedTodayHint:
      'Makikita ng customer na sarado ka hanggang bukas. Hindi magbabago ang lingguhang oras mo.',
    findSupplier: 'Maghanap ng supplier',
    supplierNeed: 'Ano ang kailangan mo?',
  },
  hi: {
    closedToday: 'आज बंद',
    closedTodayHint: 'ग्राहक कल तक दुकान बंद देखेंगे। आपका रोज़ का समय नहीं बदलेगा।',
    findSupplier: 'सप्लायर ढूँढें',
    supplierNeed: 'आपको क्या चाहिए?',
  },
  bn: {
    closedToday: 'আজ বন্ধ',
    closedTodayHint: 'গ্রাহকরা কাল পর্যন্ত দোকান বন্ধ দেখবেন। সাপ্তাহিক সময় একই থাকবে।',
    findSupplier: 'সাপ্লায়ার খুঁজুন',
    supplierNeed: 'আপনার কী দরকার?',
  },
  te: {
    closedToday: 'ఈరోజు మూసివేత',
    closedTodayHint: 'రేపటి వరకు షాప్ మూసి ఉన్నట్లు కస్టమర్లు చూస్తారు. వారపు సమయాలు మారవు.',
    findSupplier: 'సప్లయర్‌ను వెతకండి',
    supplierNeed: 'మీకు ఏమి కావాలి?',
  },
  mr: {
    closedToday: 'आज बंद',
    closedTodayHint: 'ग्राहकांना उद्यापर्यंत दुकान बंद दिसेल. तुमची आठवड्याची वेळ बदलणार नाही.',
    findSupplier: 'सप्लायर शोधा',
    supplierNeed: 'तुम्हाला काय हवे आहे?',
  },
  kn: {
    closedToday: 'ಇಂದು ಮುಚ್ಚಿದೆ',
    closedTodayHint: 'ನಾಳೆಯವರೆಗೆ ಅಂಗಡಿ ಮುಚ್ಚಿದೆ ಎಂದು ಗ್ರಾಹಕರು ನೋಡುತ್ತಾರೆ. ವಾರದ ಸಮಯ ಬದಲಾಗುವುದಿಲ್ಲ.',
    findSupplier: 'ಸಪ್ಲೈಯರ್ ಹುಡುಕಿ',
    supplierNeed: 'ನಿಮಗೆ ಏನು ಬೇಕು?',
  },
}

export function useTwoPathsCopy(): TwoPathsCopy {
  return copy[useLocale()]
}
