import { useLocale } from '../../state/hooks'
import type { Locale } from '../../i18n/locales'

const copy: Record<Locale, { more: string; document: string; agree: string }> = {
  en: { more: 'Show more', document: 'Show document', agree: 'I agree' },
  hi: { more: 'और देखें', document: 'दस्तावेज़ देखें', agree: 'मैं सहमत हूँ' },
  bn: { more: 'আরও দেখুন', document: 'নথি দেখুন', agree: 'আমি সম্মত' },
  ta: { more: 'மேலும் காட்டு', document: 'ஆவணத்தைக் காட்டு', agree: 'ஏற்கிறேன்' },
  te: { more: 'మరిన్ని చూపించు', document: 'పత్రం చూపించు', agree: 'అంగీకరిస్తున్నాను' },
  mr: { more: 'आणखी पहा', document: 'दस्तऐवज पहा', agree: 'मला मान्य आहे' },
  kn: { more: 'ಇನ್ನಷ್ಟು ತೋರಿಸಿ', document: 'ದಾಖಲೆ ತೋರಿಸಿ', agree: 'ಒಪ್ಪುತ್ತೇನೆ' },
  'zh-Hans': { more: '显示更多', document: '查看文档', agree: '我同意' },
  ms: { more: 'Tunjuk lagi', document: 'Tunjuk dokumen', agree: 'Saya setuju' },
  ja: { more: 'もっと見る', document: '文書を表示', agree: '同意する' },
  ko: { more: '더 보기', document: '문서 보기', agree: '동의합니다' },
  id: { more: 'Lihat lainnya', document: 'Lihat dokumen', agree: 'Saya setuju' },
  th: { more: 'ดูเพิ่มเติม', document: 'ดูเอกสาร', agree: 'ฉันยอมรับ' },
  vi: { more: 'Xem thêm', document: 'Xem tài liệu', agree: 'Tôi đồng ý' },
  fil: { more: 'Ipakita pa', document: 'Ipakita ang dokumento', agree: 'Sumasang-ayon ako' },
}

export const usePaceCopy = () => copy[useLocale()]
