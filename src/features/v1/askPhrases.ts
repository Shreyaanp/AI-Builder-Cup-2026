import type { Locale } from '../../i18n/locales'
import guide from './appGuide.json' with { type: 'json' }

/**
 * The second path to a feature, under the screen's content: "Or just ask: …" with the same
 * phrase the coach knows. Phrases and screen paths come from one shared map,
 * backend/app/app_guide.py, exported to appGuide.json (simplify batch 2).
 */
export type GuideFeature = (typeof guide.features)[number]
export type GuideId = GuideFeature['id']

export const askLead: Record<Locale, (phrase: string) => string> = {
  en: (phrase) => `Or just ask: “${phrase}”`,
  'zh-Hans': (phrase) => `或者直接问：“${phrase}”`,
  ms: (phrase) => `Atau tanya sahaja: “${phrase}”`,
  ta: (phrase) => `அல்லது கேளுங்கள்: “${phrase}”`,
  ja: (phrase) => `または話しかけるだけ：「${phrase}」`,
  ko: (phrase) => `또는 이렇게 물어보세요: “${phrase}”`,
  id: (phrase) => `Atau tanya saja: “${phrase}”`,
  th: (phrase) => `หรือถามเลย: “${phrase}”`,
  vi: (phrase) => `Hoặc chỉ cần hỏi: “${phrase}”`,
  fil: (phrase) => `O itanong lang: “${phrase}”`,
  hi: (phrase) => `या बस पूछिए: “${phrase}”`,
  bn: (phrase) => `অথবা শুধু জিজ্ঞেস করুন: “${phrase}”`,
  te: (phrase) => `లేదా అడగండి: “${phrase}”`,
  mr: (phrase) => `किंवा फक्त विचारा: “${phrase}”`,
  kn: (phrase) => `ಅಥವಾ ಕೇಳಿ: “${phrase}”`,
}

export function guideFeature(id: GuideId): GuideFeature {
  return guide.features.find((feature) => feature.id === id)!
}

/** The phrase in the owner's language: Hindi has its own; other languages use English. */
export function askPhrase(id: GuideId, locale: Locale): string {
  const feature = guideFeature(id)
  return locale === 'hi' && feature.ask_hi ? feature.ask_hi : feature.ask
}
