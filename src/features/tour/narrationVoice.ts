import type { Api } from '../v1/api'
import { utter } from '../v1/phoneVoice'
import { demoAudioUrl } from './demoLines'
import type { NarrationVoice } from './narrationQueue'

/** The read-only demo plays a pre-recorded file for a known line and stays silent otherwise:
 * no live /tts call (it is refused) and never the phone's robotic voice. */
function recordedVoice(): NarrationVoice {
  return {
    async load(text, language) {
      const url = demoAudioUrl(text, language)
      if (!url) return null
      const audio = new Audio(url)
      const stop = () => {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
      audio.onended = stop
      return { play: () => audio.play(), stop }
    },
    fallback: () => null,
  }
}

export function narrationVoice(api: Api, demo = false): NarrationVoice {
  if (demo) return recordedVoice()
  return {
    async load(text, language, signal) {
      const response = await api<Response>('/tts', {
        method: 'POST',
        body: JSON.stringify({ text, language }),
        raw: true,
        signal,
      })
      if (response.status !== 200) return null
      const url = URL.createObjectURL(await response.blob())
      const audio = new Audio(url)
      const stop = () => {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
        URL.revokeObjectURL(url)
      }
      audio.onended = stop
      audio.onerror = () => URL.revokeObjectURL(url)
      return { play: () => audio.play(), stop }
    },
    fallback(text, language) {
      if (!('speechSynthesis' in window)) return null
      const utterance = utter(text, language)
      return {
        async play() {
          speechSynthesis.cancel()
          speechSynthesis.speak(utterance)
        },
        stop: () => speechSynthesis.cancel(),
      }
    },
  }
}
