import { useCallback, useEffect, useRef, useState } from 'react'
import { useIdentity } from '../../auth/useIdentity'
import { reconnectDelay, waitOnline } from '../../api/stream'
import type { CoachEvent } from '../../api/stream'
import { useLocale } from '../../state/hooks'
import { useLanguageSwitch } from './languageSwitch'
import { useCopy } from './strings'
import type { Business, Product } from './api'

/** One socket to the Live session. A conversation may use many in a row (see `connect`). */
interface VoiceRuntime {
  socket: WebSocket
  deadline?: ReturnType<typeof setTimeout>
  cleanup: () => void
  complete: boolean
  /** The server said ready: audio may flow (before that it expects its setup frames). */
  ready: boolean
}

/**
 * The audio side, kept across reconnects in conversation mode so the microphone never closes
 * while the conversation is open: the context, the coach's playback bus and both level meters.
 */
interface VoiceMedia {
  audio: AudioContext
  output: GainNode
  outputMeter: AnalyserNode
  inputMeter?: AnalyserNode
  stream?: MediaStream
  node?: AudioWorkletNode
  sources: Set<AudioBufferSourceNode>
  next: number
}

type NewShopDraft = { business: Business['fields'] | null; products: Product[] }

/** Why voice stopped, so the screen can say what to do (each has its own alert). */
export type VoiceProblem =
  | { kind: 'mic-blocked' }
  | { kind: 'no-mic' }
  | { kind: 'connection' }
  | { kind: 'rate-limited'; seconds: number }
  | { kind: 'unavailable' }

/**
 * Conversation mode (the new-shop flow): one open conversation for many turns. The coach speaks
 * first, the microphone opens once its first turn has played and then stays on, turns end by the
 * model's own voice activity detection, and when a Live socket ends (its time cap, a network
 * drop) the hook reconnects to the same session with the microphone still open.
 */
export interface VoiceConversation {
  /** The session is open and the microphone granted (`resumed`: after a reconnect). */
  onReady?: (resumed: boolean) => void
}

/**
 * Consecutive reconnect attempts before a conversation pauses and offers Retry (with growing
 * pauses up to 8 s, about half a minute in all: long enough for a network switch or a lift).
 */
const RETRIES = 6
/** Attempts after the server itself refused the session (provider down, a bad session). */
const REFUSED_RETRIES = 4
const METER = new Float32Array(512)

function level(meter: AnalyserNode | undefined) {
  if (!meter) return 0
  meter.getFloatTimeDomainData(METER)
  let sum = 0
  for (const value of METER) sum += value * value
  return Math.min(1, Math.sqrt(sum / METER.length) * 4)
}

function micProblem(failure: unknown): VoiceProblem | null {
  if (!(failure instanceof DOMException)) return null
  if (['NotAllowedError', 'SecurityError'].includes(failure.name)) return { kind: 'mic-blocked' }
  if (
    ['NotFoundError', 'NotReadableError', 'OverconstrainedError', 'AbortError'].includes(
      failure.name,
    )
  )
    return { kind: 'no-mic' }
  return null
}

export function useVoice(
  businessId: string | null,
  onEvent: (event: CoachEvent) => void,
  newShop?: NewShopDraft,
  conversation?: VoiceConversation,
) {
  const identity = useIdentity()
  const t = useCopy()
  // The app's one language preference: the Live session speaks it (never guesses from audio).
  const locale = useLocale()
  const localeRef = useRef(locale)
  useEffect(() => {
    localeRef.current = locale
  }, [locale])
  const switchLanguage = useLanguageSwitch()
  const owner = useRef<AbortController | null>(null)
  const [state, setState] = useState<
    'idle' | 'connecting' | 'reconnecting' | 'recording' | 'replying'
  >('idle')
  const [error, setError] = useState('')
  const [problem, setProblem] = useState<VoiceProblem | null>(null)
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)
  const [micPaused, setMicPausedState] = useState(false)
  const micPausedRef = useRef(false)
  const runtime = useRef<VoiceRuntime | null>(null)
  const media = useRef<VoiceMedia | null>(null)
  const attempts = useRef(0)
  const mounted = useRef(false)
  const eventRef = useRef(onEvent)
  useEffect(() => {
    eventRef.current = onEvent
  }, [onEvent])
  const conversationRef = useRef(conversation)
  useEffect(() => {
    conversationRef.current = conversation
  }, [conversation])
  const draftRef = useRef(newShop)
  useEffect(() => {
    draftRef.current = newShop
  }, [newShop])
  // Conversation mode: the microphone stays closed until the coach's first turn has played.
  const micOpen = useRef(false)
  const releaseSocket = useCallback(() => {
    const current = runtime.current
    runtime.current = null
    if (current) {
      current.cleanup()
      clearTimeout(current.deadline)
      current.socket.close()
    }
  }, [])
  const releaseMedia = useCallback(() => {
    const current = media.current
    media.current = null
    if (current) {
      current.node?.disconnect()
      current.stream?.getTracks().forEach((track) => track.stop())
      void current.audio.close()
    }
  }, [])
  const stop = useCallback(() => {
    owner.current?.abort()
    owner.current = null
    releaseSocket()
    releaseMedia()
    speechSynthesis.cancel()
    if (mounted.current) setState('idle')
  }, [releaseSocket, releaseMedia])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      stop()
    }
  }, [businessId, identity.scope, stop])
  function fail(next: VoiceProblem) {
    setProblem(next)
    setError(
      next.kind === 'mic-blocked'
        ? t.voiceMicDenied
        : next.kind === 'rate-limited'
          ? t.voiceRateLimited(next.seconds)
          : t.voiceFailed,
    )
  }
  function toggleMute() {
    mutedRef.current = !mutedRef.current
    setMuted(mutedRef.current)
    const current = media.current
    // What is already queued goes quiet at once, not only the next sentence.
    if (current) current.output.gain.value = mutedRef.current ? 0 : 1
  }
  /** Conversation mode: hold the microphone (the session stays open) or let it listen again. */
  function setMicPaused(paused: boolean) {
    micPausedRef.current = paused
    setMicPausedState(paused)
    media.current?.stream?.getAudioTracks().forEach((track) => (track.enabled = !paused))
  }
  function finishRecording() {
    const current = runtime.current
    if (!current) return
    clearTimeout(current.deadline)
    const audio = media.current
    if (audio) {
      audio.node?.disconnect()
      audio.stream?.getTracks().forEach((track) => track.stop())
      audio.node = undefined
      audio.stream = undefined
    }
    if (current.socket.readyState === WebSocket.OPEN)
      current.socket.send(JSON.stringify({ kind: 'audio_end' }))
    setState('replying')
  }
  /** `listening`: a conversation the coach has already opened, so the mic opens at once. */
  async function start(sessionId: string | null = null, listening = false) {
    if (owner.current) return
    const operation = new AbortController()
    owner.current = operation
    micOpen.current = !conversationRef.current || listening
    attempts.current = 0
    setError('')
    setProblem(null)
    try {
      await connect(operation, 0, sessionId ?? undefined)
    } catch {
      if (!operation.signal.aborted) {
        fail({ kind: 'unavailable' })
        stop()
      }
    }
  }
  /** Conversation mode: a typed turn or an app note in the same live session (false: not open). */
  function sendText(text: string, draft?: NewShopDraft) {
    const current = runtime.current
    if (!current?.ready || current.socket.readyState !== WebSocket.OPEN) return false
    if (draft) current.socket.send(JSON.stringify({ kind: 'new_shop', draft }))
    current.socket.send(JSON.stringify({ kind: 'text', text }))
    return true
  }
  /** Seconds of coach audio still queued to play. */
  function playbackRemaining() {
    const current = media.current
    return current ? Math.max(0, current.next - current.audio.currentTime) : 0
  }
  /** Live loudness (0–1) of the owner's microphone and of the coach's voice, for visuals. */
  function levels() {
    const current = media.current
    return {
      input: micOpen.current && !micPausedRef.current ? level(current?.inputMeter) : 0,
      output: level(current?.outputMeter),
    }
  }
  function ensureMedia() {
    if (media.current) return media.current
    const audio = new AudioContext()
    const output = audio.createGain()
    output.gain.value = mutedRef.current ? 0 : 1
    const outputMeter = audio.createAnalyser()
    outputMeter.fftSize = 512
    output.connect(outputMeter)
    outputMeter.connect(audio.destination)
    media.current = { audio, output, outputMeter, sources: new Set(), next: 0 }
    return media.current
  }
  async function ensureMicrophone(current: VoiceMedia) {
    if (current.stream?.active && current.node) return
    await current.audio.audioWorklet.addModule('/audio-capture.worklet.js')
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
    if (media.current !== current) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    stream.getAudioTracks().forEach((track) => (track.enabled = !micPausedRef.current))
    current.stream = stream
    const node = new AudioWorkletNode(current.audio, 'pcm-capture')
    current.node = node
    const source = current.audio.createMediaStreamSource(stream)
    source.connect(node)
    const inputMeter = current.audio.createAnalyser()
    inputMeter.fftSize = 512
    source.connect(inputMeter)
    current.inputMeter = inputMeter
    const silent = current.audio.createGain()
    silent.gain.value = 0
    node.connect(silent)
    silent.connect(current.audio.destination)
    // Always the socket of the moment: a reconnect swaps it under the same microphone.
    node.port.onmessage = (packet: MessageEvent<ArrayBuffer>) => {
      const socket = runtime.current
      if (
        socket?.ready &&
        micOpen.current &&
        !micPausedRef.current &&
        socket.socket.readyState === WebSocket.OPEN &&
        socket.socket.bufferedAmount < 65536
      )
        socket.socket.send(packet.data)
    }
  }
  async function connect(operation: AbortController, attempt: number, sid?: string, quick = false) {
    if (operation.signal.aborted) return
    const retry = attempt > 0
    setError('')
    setState(retry ? 'reconnecting' : 'connecting')
    let token: string | null
    try {
      if (retry) {
        const recovery = AbortSignal.any([operation.signal, AbortSignal.timeout(45_000)])
        await waitOnline(recovery)
        await reconnectDelay(quick ? 150 : Math.min(500 * 2 ** (attempt - 1), 8000), recovery)
      }
      token = await identity.getToken()
    } catch {
      if (!operation.signal.aborted) {
        fail({ kind: 'connection' })
        stop()
      }
      return
    }
    if (!mounted.current || operation.signal.aborted) return
    const url = new URL('/api/v1/voice', location.href)
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    if (businessId) url.searchParams.set('business_id', businessId)
    if (newShop) url.searchParams.set('new_shop', 'true')
    if (sid) url.searchParams.set('session_id', sid)
    url.searchParams.set('lang', localeRef.current)
    const audio = ensureMedia()
    const socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    let sessionId = sid
    let lastMessage = 0
    // The server's reason before it closed (time cap, provider error), for the next step.
    let lastCode = ''
    const offline = () => socket.close(4000, 'Connection interrupted')
    const watchdog = setInterval(() => {
      if (lastMessage && performance.now() - lastMessage > 45_000)
        socket.close(4000, 'Heartbeat missed')
    }, 5_000)
    const foreground = () => {
      if (document.visibilityState === 'visible' && performance.now() - lastMessage > 45_000)
        socket.close(4000, 'Heartbeat missed')
    }
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', foreground)
    const current: VoiceRuntime = {
      socket,
      complete: false,
      ready: false,
      cleanup: () => {
        clearInterval(watchdog)
        window.removeEventListener('offline', offline)
        document.removeEventListener('visibilitychange', foreground)
        socket.onclose = null
        socket.onerror = null
        socket.onmessage = null
        socket.onopen = null
      },
    }
    runtime.current = current
    current.deadline = setTimeout(() => socket.close(4000, 'Connection timeout'), 45_000)
    socket.onopen = () => {
      lastMessage = performance.now()
      if (token) socket.send(JSON.stringify({ kind: 'authenticate', token }))
      // A reconnect carries the draft as it is now (photos and answers since the first socket).
      if (newShop) socket.send(JSON.stringify({ kind: 'new_shop', draft: draftRef.current }))
    }
    socket.onmessage = async (message: MessageEvent<string | ArrayBuffer>) => {
      if (runtime.current !== current) return
      lastMessage = performance.now()
      try {
        if (typeof message.data !== 'string') {
          if (mutedRef.current) return
          const bytes = new DataView(message.data)
          const buffer = audio.audio.createBuffer(1, message.data.byteLength / 2, 24000)
          const values = buffer.getChannelData(0)
          for (let i = 0; i < values.length; i++) values[i] = bytes.getInt16(i * 2, true) / 32768
          const source = audio.audio.createBufferSource()
          source.buffer = buffer
          source.connect(audio.output)
          audio.sources.add(source)
          source.onended = () => audio.sources.delete(source)
          audio.next = Math.max(audio.next, audio.audio.currentTime)
          source.start(audio.next)
          audio.next += buffer.duration
          return
        }
        const event: CoachEvent = JSON.parse(message.data)
        if (event.kind === 'ping') {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ kind: 'pong' }))
          return
        }
        if (event.kind === 'error' && event.code === 'RATE_LIMITED') {
          const wait = Number(event.data?.retry_after)
          fail({
            kind: 'rate-limited',
            seconds: Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : 60,
          })
          stop()
          return
        }
        if (event.kind === 'error' && event.code === 'TAKEN_OVER') {
          // The same conversation was opened again (another tab, or this phone's newer socket):
          // this one steps aside quietly; the conversation itself carries on there.
          stop()
          return
        }
        if (event.kind === 'error' && conversationRef.current) {
          // The socket closes next; `onclose` decides between reconnecting and saying so.
          lastCode = event.code ?? 'error'
          return
        }
        if (event.kind === 'error') throw new Error(`server:${event.code ?? 'error'}`)
        switchLanguage(event)
        eventRef.current(event)
        if (event.kind === 'ready') {
          clearTimeout(current.deadline)
          sessionId = event.session_id ?? sessionId
          if (retry && !conversationRef.current) setError(t.voiceRestarted)
          await audio.audio.resume()
          await ensureMicrophone(audio)
          if (runtime.current !== current) return
          current.ready = true
          attempts.current = 0
          if (!conversationRef.current) current.deadline = setTimeout(finishRecording, 30_000)
          setState('recording')
          conversationRef.current?.onReady?.(retry)
        }
        if (event.kind === 'interrupted') {
          // The owner spoke over the coach: what was queued stops now.
          audio.sources.forEach((source) => source.stop())
          audio.sources.clear()
          audio.next = 0
        }
        if (event.kind === 'turn_complete' && conversationRef.current) {
          // Keep listening. The first completed turn (the greeting) opens the microphone once it
          // has finished playing, so the coach never hears itself.
          if (!micOpen.current)
            setTimeout(
              () => {
                if (media.current === audio) micOpen.current = true
              },
              Math.max(0, (audio.next - audio.audio.currentTime) * 1000),
            )
        } else if (event.kind === 'turn_complete') {
          current.complete = true
          clearTimeout(current.deadline)
          current.deadline = setTimeout(
            stop,
            Math.max(100, (audio.next - audio.audio.currentTime) * 1000 + 100),
          )
        }
      } catch (failure) {
        if (runtime.current !== current) return
        // Tell the server why (mic blocked, audio failed, server error) so it shows in the logs.
        const reason =
          failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure)
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ kind: 'client_error', text: reason.slice(0, 200) }))
        console.warn('Voice stopped:', reason)
        fail(micProblem(failure) ?? { kind: 'unavailable' })
        stop()
      }
    }
    // Browsers follow an error with close; one handler owns recovery and teardown.
    socket.onerror = () => {}
    socket.onclose = (event) => {
      if (runtime.current !== current) return
      releaseSocket()
      if (current.complete) {
        stop()
      } else if (conversationRef.current) {
        // A conversation only ends when the owner ends it: reconnect to the same session, at
        // once after a planned end (time cap, idle), with growing pauses after failures.
        const planned = ['SESSION_TIMEOUT', 'VOICE_IDLE'].includes(lastCode || event.reason)
        // The server said no (provider down, a bad session): fewer, shorter tries than a network
        // that may come back in a moment.
        const refused = ['PROVIDER_UNAVAILABLE', 'AUTH_OR_SESSION_ERROR', 'INVALID_FRAME'].includes(
          lastCode,
        )
        if (attempts.current >= (refused ? REFUSED_RETRIES : RETRIES)) {
          fail(refused ? { kind: 'unavailable' } : { kind: 'connection' })
          stop()
          return
        }
        attempts.current += planned ? 0 : 1
        void connect(operation, Math.max(1, attempts.current), sessionId, planned).catch(() => {
          if (!operation.signal.aborted) {
            fail({ kind: 'connection' })
            stop()
          }
        })
      } else if (!retry && ![1000, 1001, 1008].includes(event.code)) {
        void connect(operation, 1, sessionId).catch(() => {
          if (!operation.signal.aborted) {
            fail({ kind: 'connection' })
            stop()
          }
        })
      } else {
        fail({ kind: 'connection' })
        stop()
      }
    }
  }
  return {
    state,
    error,
    problem,
    muted,
    micPaused,
    start,
    stop,
    finishRecording,
    toggleMute,
    setMicPaused,
    sendText,
    playbackRemaining,
    levels,
    clearProblem: () => setProblem(null),
  }
}
