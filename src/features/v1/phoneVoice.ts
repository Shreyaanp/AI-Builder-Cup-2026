import { stripMarkdown } from '../../design/markdownUtils'

/**
 * The phone's own voice, used only when the cloud voice is unavailable. Chalkboard speaks with
 * one soft female voice everywhere (owner choice, 16 Oct: Gemini "Achernar"), so on-device speech
 * prefers a female system voice for the language. Browsers do not expose gender, so this matches
 * the names system voices commonly use.
 */
const FEMALE =
  /female|woman|achernar|aoede|kore|leda|zephyr|aria|jenny|zira|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|veena|heera|kalpana|neerja|swara|lekha|sapna|pallavi|shruti|yuna|kyoko|tingting|mei-?jia|sin-?ji|amira|damayanti|kanya|linh|ting|xiaoxiao|nanami|sun-?hi|ayu|siti|rosa|blessica/i

export function phoneVoice(language: string): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null
  const base = language.split('-')[0]?.toLowerCase() ?? ''
  const voices = speechSynthesis.getVoices()
  const exact = voices.filter((voice) => voice.lang.toLowerCase() === language.toLowerCase())
  const near = voices.filter((voice) => voice.lang.toLowerCase().startsWith(base))
  return (
    exact.find((voice) => FEMALE.test(voice.name)) ??
    near.find((voice) => FEMALE.test(voice.name)) ??
    null
  )
}

/** An utterance in the app's voice for this language (the system default when none fits). */
export function utter(text: string, language: string): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(stripMarkdown(text))
  utterance.lang = language
  try {
    const voice = phoneVoice(language)
    if (voice) utterance.voice = voice
  } catch {
    // Ignore environments where synthetic voice instances are restricted
  }
  return utterance
}
