import { stripMarkdown } from '../../design/markdownUtils'

/**
 * The phone's own voice, used only when the cloud voice is unavailable. Chalkboard speaks with
 * one soft female voice everywhere (owner choice, 16 Oct: Gemini "Achernar"), so on-device speech
 * prefers a female system voice for the language. Browsers do not expose gender, so this matches
 * the names system voices commonly use.
 */
const FEMALE =
  /female|woman|achernar|aoede|kore|leda|zephyr|aria|jenny|zira|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|veena|heera|kalpana|neerja|swara|lekha|sapna|pallavi|shruti|yuna|kyoko|tingting|mei-?jia|sin-?ji|amira|damayanti|kanya|linh|ting|xiaoxiao|nanami|sun-?hi|ayu|siti|rosa|blessica/i

// Some in-app browsers and older Android WebViews have no speech at all: a bare `speechSynthesis`
// there is a ReferenceError that blanks the whole app, so every call goes through these.
const synth = () => (window as { speechSynthesis?: SpeechSynthesis }).speechSynthesis

/** Whether this browser can read text aloud. Without it the words simply stay on screen. */
export function canSpeak(): boolean {
  return Boolean(synth()) && typeof SpeechSynthesisUtterance !== 'undefined'
}

/** Silence the phone's voice, if it has one. */
export function stopSpeech() {
  synth()?.cancel()
}

/** Say this on the phone's own voice; does nothing where there is none. */
export function speak(utterance: SpeechSynthesisUtterance) {
  synth()?.speak(utterance)
}

export function phoneVoice(language: string): SpeechSynthesisVoice | null {
  const speech = synth()
  if (!speech) return null
  const base = language.split('-')[0]?.toLowerCase() ?? ''
  const voices = speech.getVoices()
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
