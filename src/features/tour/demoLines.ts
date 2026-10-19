import { tourCopy } from './strings'

/** Languages with pre-recorded demo narration; every other language shows its text in silence. */
export const DEMO_VOICE_LANGUAGES = ['en', 'hi'] as const
type DemoVoiceLanguage = (typeof DEMO_VOICE_LANGUAGES)[number]

export type DemoLine = { key: string; text: string }

function isRecorded(language: string): language is DemoVoiceLanguage {
  return (DEMO_VOICE_LANGUAGES as readonly string[]).includes(language)
}

/** The tour's fixed spotlight lines, exactly as Tour.tsx speaks them. Story and preview steps
 * carry live shop data or UI labels, so they are not recorded. scripts/record-demo-voice.py
 * reads this list. */
export function demoLines(language: DemoVoiceLanguage): DemoLine[] {
  return tourCopy(language).steps.map((step, i) => ({
    key: `step-${i}`,
    text: `${step.title}. ${step.body}`,
  }))
}

/** The recorded file for a line the tour is about to speak, or null when it has no recording. */
export function demoAudioUrl(text: string, language: string): string | null {
  if (!isRecorded(language)) return null
  const line = demoLines(language).find((l) => l.text === text)
  return line ? `/audio/demo/${language}/${line.key}.mp3` : null
}
