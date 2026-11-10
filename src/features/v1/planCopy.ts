import { useLocale } from '../../state/hooks'
import type { Locale } from '../../i18n/locales'
import { useSourcingCopy } from '../sourcing/copy'
import { useSupplyCopy } from '../supply/copy'
import { useCopy } from './strings'

/**
 * The coach's steps list for a request with several steps (OB-174). The steps themselves are
 * the owner's own words; the tap names are the cards' own buttons, in the app language.
 */
type PlanCopy = {
  title: (done: number, total: number) => string
  next: string
  /** What the plan waits for: the one tap on the card or review. */
  waiting: (tap: string) => string
  stopped: string
  stop: string
}

const copy: Record<Locale, PlanCopy> = {
  en: {
    title: (done, total) => `Steps: ${done} of ${total} done`,
    next: 'Next',
    waiting: (tap) => `Tap ${tap}. Then I'll go on.`,
    stopped: 'Stopped. Nothing else was done.',
    stop: 'Stop here',
  },
  hi: {
    title: (done, total) => `क़दम: ${total} में से ${done} हो गए`,
    next: 'अगला',
    waiting: (tap) => `${tap} दबाएँ। फिर मैं आगे करूँगा।`,
    stopped: 'रोक दिया। इसके आगे कुछ नहीं किया गया।',
    stop: 'यहीं रोकें',
  },
  bn: {
    title: (done, total) => `ধাপ: ${total}টির মধ্যে ${done}টি হয়েছে`,
    next: 'পরের',
    waiting: (tap) => `${tap} চাপুন। তারপর আমি এগিয়ে যাব।`,
    stopped: 'থামানো হলো। আর কিছু করা হয়নি।',
    stop: 'এখানেই থামুন',
  },
  te: {
    title: (done, total) => `దశలు: ${total}లో ${done} పూర్తి`,
    next: 'తదుపరి',
    waiting: (tap) => `${tap} నొక్కండి. తర్వాత నేను కొనసాగిస్తాను.`,
    stopped: 'ఆపివేయబడింది. ఇంకేమీ చేయలేదు.',
    stop: 'ఇక్కడే ఆపు',
  },
  mr: {
    title: (done, total) => `पायऱ्या: ${total} पैकी ${done} झाल्या`,
    next: 'पुढचे',
    waiting: (tap) => `${tap} दाबा. मग मी पुढे करेन.`,
    stopped: 'थांबवले. पुढे काहीही केले नाही.',
    stop: 'इथेच थांबवा',
  },
  kn: {
    title: (done, total) => `ಹಂತಗಳು: ${total}ರಲ್ಲಿ ${done} ಆಗಿದೆ`,
    next: 'ಮುಂದಿನದು',
    waiting: (tap) => `${tap} ಒತ್ತಿ. ನಂತರ ನಾನು ಮುಂದುವರಿಸುತ್ತೇನೆ.`,
    stopped: 'ನಿಲ್ಲಿಸಲಾಗಿದೆ. ಬೇರೇನೂ ಮಾಡಿಲ್ಲ.',
    stop: 'ಇಲ್ಲೇ ನಿಲ್ಲಿಸಿ',
  },
  'zh-Hans': {
    title: (done, total) => `步骤：已完成 ${done}/${total}`,
    next: '下一步',
    waiting: (tap) => `点“${tap}”，然后我会继续。`,
    stopped: '已停止，没有再做其他事。',
    stop: '到此为止',
  },
  ms: {
    title: (done, total) => `Langkah: ${done} daripada ${total} selesai`,
    next: 'Seterusnya',
    waiting: (tap) => `Ketik ${tap}. Kemudian saya teruskan.`,
    stopped: 'Dihentikan. Tiada apa-apa lagi dibuat.',
    stop: 'Berhenti di sini',
  },
  ta: {
    title: (done, total) => `படிகள்: ${total}இல் ${done} முடிந்தது`,
    next: 'அடுத்து',
    waiting: (tap) => `${tap} அழுத்தவும். பிறகு நான் தொடர்வேன்.`,
    stopped: 'நிறுத்தப்பட்டது. வேறு எதுவும் செய்யவில்லை.',
    stop: 'இங்கேயே நிறுத்து',
  },
  ja: {
    title: (done, total) => `ステップ：${total}件中${done}件完了`,
    next: '次',
    waiting: (tap) => `「${tap}」を押してください。そのあと続けます。`,
    stopped: '停止しました。ほかには何もしていません。',
    stop: 'ここでやめる',
  },
  ko: {
    title: (done, total) => `단계: ${total}개 중 ${done}개 완료`,
    next: '다음',
    waiting: (tap) => `‘${tap}’을 누르세요. 그다음 이어서 할게요.`,
    stopped: '멈췄어요. 더 한 일은 없어요.',
    stop: '여기서 멈추기',
  },
  id: {
    title: (done, total) => `Langkah: ${done} dari ${total} selesai`,
    next: 'Berikutnya',
    waiting: (tap) => `Ketuk ${tap}. Lalu saya lanjutkan.`,
    stopped: 'Dihentikan. Tidak ada lagi yang dilakukan.',
    stop: 'Berhenti di sini',
  },
  th: {
    title: (done, total) => `ขั้นตอน: เสร็จ ${done} จาก ${total}`,
    next: 'ถัดไป',
    waiting: (tap) => `แตะ ${tap} แล้วฉันจะทำต่อ`,
    stopped: 'หยุดแล้ว ไม่ได้ทำอะไรเพิ่ม',
    stop: 'หยุดตรงนี้',
  },
  vi: {
    title: (done, total) => `Các bước: xong ${done}/${total}`,
    next: 'Tiếp theo',
    waiting: (tap) => `Chạm ${tap}. Sau đó tôi sẽ làm tiếp.`,
    stopped: 'Đã dừng. Không làm thêm gì.',
    stop: 'Dừng ở đây',
  },
  fil: {
    title: (done, total) => `Mga hakbang: ${done} sa ${total} tapos na`,
    next: 'Susunod',
    waiting: (tap) => `Pindutin ang ${tap}. Saka ako magpapatuloy.`,
    stopped: 'Itinigil. Wala nang ibang ginawa.',
    stop: 'Hanggang dito na lang',
  },
}

export function usePlanCopy(): PlanCopy & { taps: Record<string, string> } {
  const sourcing = useSourcingCopy()
  const supply = useSupplyCopy()
  const t = useCopy()
  return {
    ...(copy[useLocale()] ?? copy.en),
    // The same words as the buttons on the order card, the purchase order and the review.
    taps: { Send: sourcing.send, Approve: supply.approve, Save: t.confirmSave },
  }
}
