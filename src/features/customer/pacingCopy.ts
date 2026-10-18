import type { Locale } from '../../i18n/locales'
import { useLocale } from '../../state/hooks'

const labels: Record<Locale, [string, string]> = {
  en: ['Show more', 'I agree'],
  hi: ['और देखें', 'मैं सहमत हूँ'],
  bn: ['আরও দেখুন', 'আমি সম্মত'],
  te: ['మరిన్ని చూడండి', 'నేను అంగీకరిస్తున్నాను'],
  mr: ['आणखी पाहा', 'मी सहमत आहे'],
  kn: ['ಇನ್ನಷ್ಟು ನೋಡಿ', 'ನಾನು ಒಪ್ಪುತ್ತೇನೆ'],
  ta: ['மேலும் காண்க', 'ஒப்புக்கொள்கிறேன்'],
  'zh-Hans': ['查看更多', '我同意'],
  ja: ['もっと見る', '同意する'],
  ko: ['더 보기', '동의합니다'],
  ms: ['Lihat lagi', 'Saya setuju'],
  id: ['Lihat lainnya', 'Saya setuju'],
  th: ['ดูเพิ่มเติม', 'ฉันยอมรับ'],
  vi: ['Xem thêm', 'Tôi đồng ý'],
  fil: ['Tumingin pa', 'Sumasang-ayon ako'],
}

export function usePacingCopy() {
  const [more, agree] = labels[useLocale()]
  return { more, agree }
}
