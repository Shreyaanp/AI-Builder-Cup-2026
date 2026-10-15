import { useCallback, useEffect, useRef, useState } from 'react'
import { useIdentity } from '../../auth/useIdentity'
import { reconnectDelay, waitOnline } from '../../api/stream'
import type { CoachEvent } from '../../api/stream'
import { useCopy } from './strings'

interface VoiceRuntime {
  socket: WebSocket
  audio: AudioContext
  stream?: MediaStream
  node?: AudioWorkletNode
  deadline?: ReturnType<typeof setTimeout>
  next: number
  cleanup: () => void
  complete: boolean
}

export function useVoice(businessId: string | null, onEvent: (event: CoachEvent) => void) {
  const identity = useIdentity()
  const t = useCopy()
  const owner = useRef<AbortController | null>(null)
  const [state, setState] = useState<
    'idle' | 'connecting' | 'reconnecting' | 'recording' | 'replying'
  >('idle')
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)
  const runtime = useRef<VoiceRuntime | null>(null)
  const mounted = useRef(false)
  const eventRef = useRef(onEvent)
  useEffect(() => {
    eventRef.current = onEvent
  }, [onEvent])
  const release = useCallback(() => {
    const current = runtime.current
    runtime.current = null
    if (current) {
      current.cleanup()
      clearTimeout(current.deadline)
      current.node?.disconnect()
      current.stream?.getTracks().forEach((track) => track.stop())
      current.socket.close()
      void current.audio.close()
    }
    speechSynthesis.cancel()
  }, [])
  const stop = useCallback(() => {
    owner.current?.abort()
    owner.current = null
    release()
    if (mounted.current) setState('idle')
  }, [release])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      stop()
    }
  }, [businessId, identity.scope, stop])
  function toggleMute() {
    mutedRef.current = !mutedRef.current
    setMuted(mutedRef.current)
  }
  function finishRecording() {
    const current = runtime.current
    if (!current) return
    clearTimeout(current.deadline)
    current.node?.disconnect()
    current.stream?.getTracks().forEach((track) => track.stop())
    if (current.socket.readyState === WebSocket.OPEN)
      current.socket.send(JSON.stringify({ kind: 'audio_end' }))
    setState('replying')
  }
  async function start(sessionId: string | null = null) {
    if (owner.current) return
    const operation = new AbortController()
    owner.current = operation
    setError('')
    try {
      await connect(operation, false, sessionId ?? undefined)
    } catch {
      if (!operation.signal.aborted) {
        setError(t.voiceFailed)
        stop()
      }
    }
  }
  async function connect(operation: AbortController, retry: boolean, sid?: string) {
    if (operation.signal.aborted) return
    setError('')
    setState(retry ? 'reconnecting' : 'connecting')
    let token: string | null
    try {
      if (retry) {
        const recovery = AbortSignal.any([operation.signal, AbortSignal.timeout(45_000)])
        await waitOnline(recovery)
        await reconnectDelay(500, recovery)
      }
      token = await identity.getToken()
    } catch {
      if (!operation.signal.aborted) {
        setError(t.voiceFailed)
        stop()
      }
      return
    }
    if (!mounted.current || operation.signal.aborted) return
    const url = new URL('/api/v1/voice', location.href)
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    if (businessId) url.searchParams.set('business_id', businessId)
    if (sid) url.searchParams.set('session_id', sid)
    const audio = new AudioContext()
    const socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    let sessionId = sid
    let lastMessage = 0
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
      audio,
      next: 0,
      complete: false,
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
    }
    socket.onmessage = async (message: MessageEvent<string | ArrayBuffer>) => {
      if (runtime.current !== current) return
      lastMessage = performance.now()
      try {
        if (typeof message.data !== 'string') {
          if (mutedRef.current) return
          const bytes = new DataView(message.data)
          const buffer = audio.createBuffer(1, message.data.byteLength / 2, 24000)
          const values = buffer.getChannelData(0)
          for (let i = 0; i < values.length; i++) values[i] = bytes.getInt16(i * 2, true) / 32768
          const source = audio.createBufferSource()
          source.buffer = buffer
          source.connect(audio.destination)
          current.next = Math.max(current.next, audio.currentTime)
          source.start(current.next)
          current.next += buffer.duration
          return
        }
        const event: CoachEvent = JSON.parse(message.data)
        if (event.kind === 'ping') {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ kind: 'pong' }))
          return
        }
        if (event.kind === 'error' && event.code === 'RATE_LIMITED') {
          const wait = Number(event.data?.retry_after)
          setError(t.voiceRateLimited(Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : 60))
          stop()
          return
        }
        if (event.kind === 'error') throw new Error(`server:${event.code ?? 'error'}`)
        eventRef.current(event)
        if (event.kind === 'ready') {
          clearTimeout(current.deadline)
          sessionId = event.session_id ?? sessionId
          if (retry) setError(t.voiceRestarted)
          await audio.resume()
          await audio.audioWorklet.addModule('/audio-capture.worklet.js')
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
          })
          if (runtime.current !== current) {
            stream.getTracks().forEach((track) => track.stop())
            return
          }
          current.stream = stream
          const node = new AudioWorkletNode(audio, 'pcm-capture')
          current.node = node
          audio.createMediaStreamSource(stream).connect(node)
          const silent = audio.createGain()
          silent.gain.value = 0
          node.connect(silent)
          silent.connect(audio.destination)
          node.port.onmessage = (packet: MessageEvent<ArrayBuffer>) => {
            if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 65536)
              socket.send(packet.data)
          }
          current.deadline = setTimeout(finishRecording, 30_000)
          setState('recording')
        }
        if (event.kind === 'interrupted') {
          await audio.suspend()
          current.next = 0
          await audio.resume()
        }
        if (event.kind === 'turn_complete') {
          current.complete = true
          clearTimeout(current.deadline)
          current.deadline = setTimeout(
            stop,
            Math.max(100, (current.next - audio.currentTime) * 1000 + 100),
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
        setError(
          failure instanceof DOMException &&
            ['NotAllowedError', 'SecurityError'].includes(failure.name)
            ? t.voiceMicDenied
            : t.voiceFailed,
        )
        stop()
      }
    }
    // Browsers follow an error with close; one handler owns recovery and teardown.
    socket.onerror = () => {}
    socket.onclose = (event) => {
      if (runtime.current !== current) return
      release()
      if (current.complete) {
        stop()
      } else if (!retry && ![1000, 1001, 1008].includes(event.code)) {
        void connect(operation, true, sessionId).catch(() => {
          if (!operation.signal.aborted) {
            setError(t.voiceFailed)
            stop()
          }
        })
      } else {
        setError(t.voiceFailed)
        stop()
      }
    }
  }
  return { state, error, muted, start, stop, finishRecording, toggleMute }
}
