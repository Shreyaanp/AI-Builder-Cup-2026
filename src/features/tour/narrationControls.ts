import type { Locale } from '../../i18n/locales.js'
export const narrationControls: Record<Locale, readonly [string, string]> = {
  en: ['Skip voice', 'Close tour'],
  hi: ['आवाज़ छोड़ें', 'टूर बंद करें'],
  bn: ['কণ্ঠ এড়ান', 'ট্যুর বন্ধ করুন'],
  te: ['వాయిస్ దాటవేయి', 'టూర్ మూసివేయి'],
  mr: ['आवाज वगळा', 'टूर बंद करा'],
  kn: ['ಧ್ವನಿ ಬಿಟ್ಟುಬಿಡಿ', 'ಟೂರ್ ಮುಚ್ಚಿ'],
  'zh-Hans': ['跳过语音', '关闭导览'],
  ja: ['音声をスキップ', 'ツアーを閉じる'],
  ko: ['음성 건너뛰기', '투어 닫기'],
  ms: ['Langkau suara', 'Tutup lawatan'],
  id: ['Lewati suara', 'Tutup tur'],
  ta: ['குரலைத் தவிர்', 'சுற்றுப்பயணத்தை மூடு'],
  th: ['ข้ามเสียง', 'ปิดทัวร์'],
  vi: ['Bỏ qua giọng', 'Đóng hướng dẫn'],
  fil: ['Laktawan ang boses', 'Isara ang tour'],
}
