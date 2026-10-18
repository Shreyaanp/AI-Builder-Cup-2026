// The videos' voiceover: one WAV per narration line (howItWorksCopy.ts *Voice), spoken by Google
// Cloud Text-to-Speech (Chirp 3 HD, inside the free monthly tier: the four tracks are ~2,500
// characters). Each line is cached by its text and voice, so re-running costs nothing.
// Uses your gcloud login. Foreground only:
//   node scripts/howitworks-videos/voice.mjs [vendor|customer] [en|hi]
import { execSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pagesEnglish, pagesHindi } from '../../src/features/frontdoors/howItWorksCopy.ts'

const work = process.env.HIW_WORK ?? 'C:/Users/pshre/work/hiw-video'
const project = process.env.TTS_PROJECT ?? 'ichiropractic'
// A calm, warm voice; the same speaker in both languages.
const VOICES = { en: 'en-IN-Chirp3-HD-Aoede', hi: 'hi-IN-Chirp3-HD-Aoede' }
const RATE = 0.95

export const voiceLines = (flow, lang) => {
  const t = lang === 'hi' ? pagesHindi : pagesEnglish
  return flow === 'vendor' ? t.vendorVoice : t.customerVoice
}

/** Seconds of audio in a WAV file. */
export function seconds(file) {
  const run = spawnSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ])
  return Number(String(run.stdout).trim())
}

let token = ''
function accessToken() {
  if (!token) token = execSync('gcloud auth print-access-token').toString().trim()
  return token
}

async function speak(text, lang, file) {
  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'x-goog-user-project': project,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: lang === 'hi' ? 'hi-IN' : 'en-IN', name: VOICES[lang] },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate: RATE },
    }),
  })
  if (!response.ok) throw new Error(`TTS ${response.status}: ${await response.text()}`)
  const { audioContent } = await response.json()
  writeFileSync(file, Buffer.from(audioContent, 'base64'))
}

/** The WAV files for one flow and language, in scene order: [intro, ...scenes, end]. */
export async function voiceover(flow, lang) {
  const dir = join(work, 'voice')
  mkdirSync(dir, { recursive: true })
  const clips = []
  let spoken = 0
  for (const text of voiceLines(flow, lang)) {
    const key = createHash('sha1').update(`${VOICES[lang]}|${RATE}|${text}`).digest('hex')
    const file = join(dir, `${key.slice(0, 16)}.wav`)
    if (!existsSync(file)) {
      await speak(text, lang, file)
      spoken += text.length
    }
    clips.push({ text, file, seconds: seconds(file) })
  }
  if (spoken) console.log(`  TTS ${flow}-${lang}: ${spoken} characters synthesised`)
  return clips
}

if (process.argv[1]?.endsWith('voice.mjs')) {
  const flows = process.argv[2] ? [process.argv[2]] : ['vendor', 'customer']
  const langs = process.argv[3] ? [process.argv[3]] : ['en', 'hi']
  for (const flow of flows)
    for (const lang of langs) {
      const clips = await voiceover(flow, lang)
      const total = clips.reduce((sum, clip) => sum + clip.seconds, 0)
      console.log(`${flow}-${lang}: ${total.toFixed(1)} s of speech`)
      for (const clip of clips) console.log(`  ${clip.seconds.toFixed(2)} s  ${clip.text}`)
    }
}
