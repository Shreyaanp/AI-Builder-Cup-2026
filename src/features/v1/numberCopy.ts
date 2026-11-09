import type { Locale } from '../../i18n/locales'

/** A lone comma or dot that could go either way: a plain question, never a guess. */
const numberQuestions: Record<Locale, string> = {
  en: 'Did you mean {a} or {b}? Please type it again.',
  'zh-Hans': '您是指 {a} 还是 {b}？请重新输入。',
  ms: 'Maksud anda {a} atau {b}? Taip semula dengan jelas.',
  ta: '{a} ஆ அல்லது {b} ஆ? தெளிவாக மீண்டும் எழுதவும்.',
  ja: '{a} ですか、{b} ですか？もう一度入力してください。',
  ko: '{a}인가요, {b}인가요? 다시 입력해 주세요.',
  id: 'Maksudnya {a} atau {b}? Ketik ulang dengan jelas.',
  th: 'หมายถึง {a} หรือ {b}? กรอกใหม่ให้ชัดเจน',
  vi: 'Ý bạn là {a} hay {b}? Hãy nhập lại cho rõ.',
  fil: '{a} ba o {b}? I-type ulit nang malinaw.',
  hi: 'आपका मतलब {a} है या {b}? साफ़ करके फिर से लिखें।',
  bn: 'আপনি কি {a} বোঝাচ্ছেন, না {b}? আবার স্পষ্ট করে লিখুন।',
  te: 'మీ ఉద్దేశం {a} నా లేదా {b} నా? మళ్లీ స్పష్టంగా రాయండి.',
  mr: 'तुम्हाला {a} म्हणायचे आहे की {b}? पुन्हा स्पष्ट लिहा.',
  kn: 'ನೀವು {a} ಎಂದೋ {b} ಎಂದೋ? ಮತ್ತೆ ಸ್ಪಷ್ಟವಾಗಿ ಬರೆಯಿರಿ.',
}

/** "Did you mean {a} or {b}?" in the owner's language. */
export function numberQuestion(locale: Locale): string {
  return numberQuestions[locale]
}
