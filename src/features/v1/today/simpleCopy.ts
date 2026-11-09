import { useLocale } from '../../../state/hooks'
import type { Locale } from '../../../i18n/locales'

/** Coach Today, the first-run card and the top bar's one menu (simplify batch 5). */
export type SimpleCopy = {
  /** Composer hint once a shop exists: what the box is for. */
  askPlaceholder: string
  /** Opens every example sentence (the coach guide). */
  whatCanIAsk: string
  /** The top bar's one ⋯ button on Coach. */
  moreOptions: string
  /** Its sheet: a new chat and past chats. */
  startAgain: string
  /** Two short chips under Today; each sends a full sentence to the coach. */
  chipMake: string
  chipMenu: string
  /** From a chat to Home's cards, and back. */
  backToToday: string
  backToChat: string
}

const copy: Record<Locale, SimpleCopy> = {
  en: {
    askPlaceholder: 'Ask anything…',
    whatCanIAsk: 'What can I ask?',
    moreOptions: 'More options',
    startAgain: 'Start again',
    chipMake: 'How much to make?',
    chipMenu: 'Change my menu',
    backToToday: "Today's list",
    backToChat: 'Back to chat',
  },
  'zh-Hans': {
    askPlaceholder: '随便问…',
    whatCanIAsk: '我可以问什么？',
    moreOptions: '更多选项',
    startAgain: '重新开始',
    chipMake: '该做多少？',
    chipMenu: '改菜单',
    backToToday: '今日清单',
    backToChat: '回到聊天',
  },
  ms: {
    askPlaceholder: 'Tanya apa saja…',
    whatCanIAsk: 'Apa yang boleh saya tanya?',
    moreOptions: 'Lagi pilihan',
    startAgain: 'Mula semula',
    chipMake: 'Berapa nak buat?',
    chipMenu: 'Tukar menu',
    backToToday: 'Senarai hari ini',
    backToChat: 'Kembali ke sembang',
  },
  ta: {
    askPlaceholder: 'கேளுங்கள்…',
    whatCanIAsk: 'நான் என்ன கேட்கலாம்?',
    moreOptions: 'மேலும் விருப்பங்கள்',
    startAgain: 'மீண்டும் தொடங்கு',
    chipMake: 'எவ்வளவு செய்வது?',
    chipMenu: 'மெனுவை மாற்று',
    backToToday: 'இன்றைய பட்டியல்',
    backToChat: 'அரட்டைக்குத் திரும்பு',
  },
  ja: {
    askPlaceholder: '何でも聞いて…',
    whatCanIAsk: '何を聞けますか？',
    moreOptions: 'その他',
    startAgain: 'はじめからやり直す',
    chipMake: 'どれだけ作る？',
    chipMenu: 'メニューを変える',
    backToToday: '今日のリスト',
    backToChat: 'チャットに戻る',
  },
  ko: {
    askPlaceholder: '물어보세요…',
    whatCanIAsk: '무엇을 물어볼 수 있나요?',
    moreOptions: '더보기',
    startAgain: '다시 시작',
    chipMake: '얼마나 만들까?',
    chipMenu: '메뉴 바꾸기',
    backToToday: '오늘의 목록',
    backToChat: '채팅으로 돌아가기',
  },
  id: {
    askPlaceholder: 'Tanya apa saja…',
    whatCanIAsk: 'Apa yang bisa saya tanyakan?',
    moreOptions: 'Opsi lain',
    startAgain: 'Mulai lagi',
    chipMake: 'Berapa yang dibuat?',
    chipMenu: 'Ubah menu',
    backToToday: 'Daftar hari ini',
    backToChat: 'Kembali ke chat',
  },
  th: {
    askPlaceholder: 'ถามอะไรก็ได้…',
    whatCanIAsk: 'ถามอะไรได้บ้าง?',
    moreOptions: 'ตัวเลือกเพิ่มเติม',
    startAgain: 'เริ่มใหม่',
    chipMake: 'ทำเท่าไหร่ดี?',
    chipMenu: 'แก้เมนู',
    backToToday: 'รายการวันนี้',
    backToChat: 'กลับไปที่แชต',
  },
  vi: {
    askPlaceholder: 'Hỏi bất cứ gì…',
    whatCanIAsk: 'Tôi có thể hỏi gì?',
    moreOptions: 'Tùy chọn khác',
    startAgain: 'Bắt đầu lại',
    chipMake: 'Làm bao nhiêu?',
    chipMenu: 'Đổi thực đơn',
    backToToday: 'Danh sách hôm nay',
    backToChat: 'Quay lại trò chuyện',
  },
  fil: {
    askPlaceholder: 'Magtanong…',
    whatCanIAsk: 'Ano ang puwede kong itanong?',
    moreOptions: 'Iba pang opsyon',
    startAgain: 'Magsimula ulit',
    chipMake: 'Ilan ang gagawin?',
    chipMenu: 'Baguhin ang menu',
    backToToday: 'Listahan ngayon',
    backToChat: 'Bumalik sa chat',
  },
  hi: {
    askPlaceholder: 'कुछ भी पूछें…',
    whatCanIAsk: 'क्या-क्या पूछ सकते हैं?',
    moreOptions: 'और विकल्प',
    startAgain: 'फिर से शुरू करें',
    chipMake: 'कितना बनाना है?',
    chipMenu: 'मेन्यू बदलें',
    backToToday: 'आज की सूची',
    backToChat: 'चैट पर वापस',
  },
  bn: {
    askPlaceholder: 'জিজ্ঞেস করুন…',
    whatCanIAsk: 'কী কী জিজ্ঞেস করা যায়?',
    moreOptions: 'আরও বিকল্প',
    startAgain: 'আবার শুরু করুন',
    chipMake: 'কতটা বানাব?',
    chipMenu: 'মেনু বদলান',
    backToToday: 'আজকের তালিকা',
    backToChat: 'চ্যাটে ফিরুন',
  },
  te: {
    askPlaceholder: 'ఏదైనా అడగండి…',
    whatCanIAsk: 'ఏమేమి అడగవచ్చు?',
    moreOptions: 'మరిన్ని ఎంపికలు',
    startAgain: 'మళ్లీ మొదలుపెట్టండి',
    chipMake: 'ఎంత తయారు చేయాలి?',
    chipMenu: 'మెనూ మార్చండి',
    backToToday: 'ఈరోజు జాబితా',
    backToChat: 'చాట్‌కు తిరిగి',
  },
  mr: {
    askPlaceholder: 'काहीही विचारा…',
    whatCanIAsk: 'काय काय विचारता येईल?',
    moreOptions: 'आणखी पर्याय',
    startAgain: 'पुन्हा सुरू करा',
    chipMake: 'किती बनवायचे?',
    chipMenu: 'मेन्यू बदला',
    backToToday: 'आजची यादी',
    backToChat: 'चॅटवर परत',
  },
  kn: {
    askPlaceholder: 'ಏನಾದರೂ ಕೇಳಿ…',
    whatCanIAsk: 'ಏನೇನು ಕೇಳಬಹುದು?',
    moreOptions: 'ಇನ್ನಷ್ಟು ಆಯ್ಕೆಗಳು',
    startAgain: 'ಮತ್ತೆ ಪ್ರಾರಂಭಿಸಿ',
    chipMake: 'ಎಷ್ಟು ಮಾಡಬೇಕು?',
    chipMenu: 'ಮೆನು ಬದಲಿಸಿ',
    backToToday: 'ಇಂದಿನ ಪಟ್ಟಿ',
    backToChat: 'ಚಾಟ್‌ಗೆ ಹಿಂತಿರುಗಿ',
  },
}

export function simpleCopyFor(locale: Locale): SimpleCopy {
  return copy[locale]
}

export function useSimpleCopy(): SimpleCopy {
  return simpleCopyFor(useLocale())
}
