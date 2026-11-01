import { useLocale } from '../../state/hooks'
import type { Locale } from '../../i18n/locales'

/** Screen entries for features that used to be chat-only (simplify batch 2). */
type TwoPathsCopy = {
  closedToday: string
  closedTodayHint: string
  replyLanguage: string
  replyLanguageHint: string
  findSupplier: string
  supplierNeed: string
}

const copy: Record<Locale, TwoPathsCopy> = {
  en: {
    closedToday: 'Closed today',
    closedTodayHint: 'Customers see you closed until tomorrow. Your weekly hours stay the same.',
    replyLanguage: 'Reply language',
    replyLanguageHint:
      'The app and the coach use this language with you. Replies to customers follow their language.',
    findSupplier: 'Find a supplier',
    supplierNeed: 'What do you need?',
  },
  'zh-Hans': {
    closedToday: '今天休息',
    closedTodayHint: '顾客会看到你今天休息，直到明天。每周营业时间不变。',
    replyLanguage: '回复语言',
    replyLanguageHint: '应用和教练会用这种语言和你交流。给顾客的回复会用顾客的语言。',
    findSupplier: '找供应商',
    supplierNeed: '你需要什么？',
  },
  ms: {
    closedToday: 'Tutup hari ini',
    closedTodayHint: 'Pelanggan nampak kedai tutup hingga esok. Waktu mingguan anda kekal.',
    replyLanguage: 'Bahasa balasan',
    replyLanguageHint:
      'Aplikasi dan jurulatih guna bahasa ini dengan anda. Balasan kepada pelanggan ikut bahasa mereka.',
    findSupplier: 'Cari pembekal',
    supplierNeed: 'Apa yang anda perlukan?',
  },
  ta: {
    closedToday: 'இன்று மூடல்',
    closedTodayHint:
      'நாளை வரை கடை மூடியிருப்பதாக வாடிக்கையாளர்கள் பார்ப்பார்கள். வாராந்திர நேரம் மாறாது.',
    replyLanguage: 'பதில் மொழி',
    replyLanguageHint:
      'ஆப்பும் கோச்சும் உங்களுடன் இந்த மொழியில் பேசும். வாடிக்கையாளர் பதில்கள் அவர்கள் மொழியில் இருக்கும்.',
    findSupplier: 'சப்ளையரைத் தேடு',
    supplierNeed: 'உங்களுக்கு என்ன வேண்டும்?',
  },
  ja: {
    closedToday: '今日は休み',
    closedTodayHint: 'お客様には明日まで休みと表示されます。毎週の営業時間は変わりません。',
    replyLanguage: '返信の言語',
    replyLanguageHint:
      'アプリとコーチはこの言語で話します。お客様への返信はお客様の言語になります。',
    findSupplier: '仕入れ先を探す',
    supplierNeed: '何が必要ですか？',
  },
  ko: {
    closedToday: '오늘 휴무',
    closedTodayHint: '손님에게 내일까지 휴무로 보입니다. 주간 영업시간은 그대로입니다.',
    replyLanguage: '답장 언어',
    replyLanguageHint: '앱과 코치가 이 언어로 말합니다. 손님 답장은 손님의 언어로 보냅니다.',
    findSupplier: '공급업체 찾기',
    supplierNeed: '무엇이 필요하세요?',
  },
  id: {
    closedToday: 'Tutup hari ini',
    closedTodayHint: 'Pelanggan melihat toko tutup sampai besok. Jam mingguan Anda tetap.',
    replyLanguage: 'Bahasa balasan',
    replyLanguageHint:
      'Aplikasi dan pelatih memakai bahasa ini dengan Anda. Balasan ke pelanggan mengikuti bahasa mereka.',
    findSupplier: 'Cari pemasok',
    supplierNeed: 'Apa yang Anda butuhkan?',
  },
  th: {
    closedToday: 'วันนี้ปิด',
    closedTodayHint: 'ลูกค้าจะเห็นว่าร้านปิดจนถึงพรุ่งนี้ เวลาเปิดประจำสัปดาห์ไม่เปลี่ยน',
    replyLanguage: 'ภาษาที่ใช้ตอบ',
    replyLanguageHint: 'แอปและโค้ชจะใช้ภาษานี้กับคุณ คำตอบถึงลูกค้าใช้ภาษาของลูกค้า',
    findSupplier: 'หาซัพพลายเออร์',
    supplierNeed: 'คุณต้องการอะไร?',
  },
  vi: {
    closedToday: 'Hôm nay nghỉ',
    closedTodayHint: 'Khách thấy quán nghỉ đến ngày mai. Giờ mở cửa hằng tuần không đổi.',
    replyLanguage: 'Ngôn ngữ trả lời',
    replyLanguageHint:
      'Ứng dụng và trợ lý dùng ngôn ngữ này với bạn. Trả lời khách theo ngôn ngữ của khách.',
    findSupplier: 'Tìm nhà cung cấp',
    supplierNeed: 'Bạn cần gì?',
  },
  fil: {
    closedToday: 'Sarado ngayon',
    closedTodayHint:
      'Makikita ng customer na sarado ka hanggang bukas. Hindi magbabago ang lingguhang oras mo.',
    replyLanguage: 'Wika ng sagot',
    replyLanguageHint:
      'Ito ang wikang gagamitin ng app at ng coach sa iyo. Ang sagot sa customer ay sa wika nila.',
    findSupplier: 'Maghanap ng supplier',
    supplierNeed: 'Ano ang kailangan mo?',
  },
  hi: {
    closedToday: 'आज बंद',
    closedTodayHint: 'ग्राहक कल तक दुकान बंद देखेंगे। आपका रोज़ का समय नहीं बदलेगा।',
    replyLanguage: 'जवाब की भाषा',
    replyLanguageHint:
      'ऐप और कोच आपसे इसी भाषा में बात करेंगे। ग्राहकों को जवाब उनकी अपनी भाषा में जाते हैं।',
    findSupplier: 'सप्लायर ढूँढें',
    supplierNeed: 'आपको क्या चाहिए?',
  },
  bn: {
    closedToday: 'আজ বন্ধ',
    closedTodayHint: 'গ্রাহকরা কাল পর্যন্ত দোকান বন্ধ দেখবেন। সাপ্তাহিক সময় একই থাকবে।',
    replyLanguage: 'উত্তরের ভাষা',
    replyLanguageHint:
      'অ্যাপ আর কোচ আপনার সঙ্গে এই ভাষায় কথা বলবে। গ্রাহকদের উত্তর তাদের ভাষায় যাবে।',
    findSupplier: 'সাপ্লায়ার খুঁজুন',
    supplierNeed: 'আপনার কী দরকার?',
  },
  te: {
    closedToday: 'ఈరోజు మూసివేత',
    closedTodayHint: 'రేపటి వరకు షాప్ మూసి ఉన్నట్లు కస్టమర్లు చూస్తారు. వారపు సమయాలు మారవు.',
    replyLanguage: 'జవాబు భాష',
    replyLanguageHint:
      'యాప్ మరియు కోచ్ మీతో ఈ భాషలో మాట్లాడతాయి. కస్టమర్లకు జవాబులు వారి భాషలో వెళ్తాయి.',
    findSupplier: 'సప్లయర్‌ను వెతకండి',
    supplierNeed: 'మీకు ఏమి కావాలి?',
  },
  mr: {
    closedToday: 'आज बंद',
    closedTodayHint: 'ग्राहकांना उद्यापर्यंत दुकान बंद दिसेल. तुमची आठवड्याची वेळ बदलणार नाही.',
    replyLanguage: 'उत्तराची भाषा',
    replyLanguageHint:
      'अ‍ॅप आणि कोच तुमच्याशी याच भाषेत बोलतील. ग्राहकांना उत्तरे त्यांच्या भाषेत जातात.',
    findSupplier: 'सप्लायर शोधा',
    supplierNeed: 'तुम्हाला काय हवे आहे?',
  },
  kn: {
    closedToday: 'ಇಂದು ಮುಚ್ಚಿದೆ',
    closedTodayHint: 'ನಾಳೆಯವರೆಗೆ ಅಂಗಡಿ ಮುಚ್ಚಿದೆ ಎಂದು ಗ್ರಾಹಕರು ನೋಡುತ್ತಾರೆ. ವಾರದ ಸಮಯ ಬದಲಾಗುವುದಿಲ್ಲ.',
    replyLanguage: 'ಉತ್ತರದ ಭಾಷೆ',
    replyLanguageHint:
      'ಆ್ಯಪ್ ಮತ್ತು ಕೋಚ್ ನಿಮ್ಮೊಂದಿಗೆ ಈ ಭಾಷೆಯಲ್ಲಿ ಮಾತನಾಡುತ್ತವೆ. ಗ್ರಾಹಕರಿಗೆ ಉತ್ತರಗಳು ಅವರ ಭಾಷೆಯಲ್ಲಿ ಹೋಗುತ್ತವೆ.',
    findSupplier: 'ಸಪ್ಲೈಯರ್ ಹುಡುಕಿ',
    supplierNeed: 'ನಿಮಗೆ ಏನು ಬೇಕು?',
  },
}

export function useTwoPathsCopy(): TwoPathsCopy {
  return copy[useLocale()]
}
