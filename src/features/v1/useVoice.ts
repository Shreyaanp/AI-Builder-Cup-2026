import { useEffect, useRef, useState } from 'react'
import { useIdentity } from '../../auth/useIdentity'
import type { CoachEvent } from '../../api/stream'

interface VoiceRuntime {
  socket: WebSocket
  audio: AudioContext
  stream?: MediaStream
  node?: AudioWorkletNode
  deadline?: ReturnType<typeof setTimeout>
  next: number
}

export function useVoice(businessId: string | null, onEvent: (event: CoachEvent) => void) {
  const identity = useIdentity()
  const [state, setState] = useState<'idle' | 'connecting' | 'recording' | 'replying'>('idle')
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)
  const runtime = useRef<VoiceRuntime | null>(null)
  const mounted = useRef(false)
  const eventRef = useRef(onEvent)
  useEffect(() => {
    eventRef.current = onEvent
  }, [onEvent])
  function stop() {
    const current = runtime.current
    runtime.current = null
    if (current) {
      clearTimeout(current.deadline)
      current.node?.disconnect()
      current.stream?.getTracks().forEach((track) => track.stop())
      current.socket.close()
      void current.audio.close()
    }
    speechSynthesis.cancel()
    if (mounted.current) setState('idle')
  }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      stop()
    }
  }, [businessId])
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
  async function start() {
    if (runtime.current) return
    setError('')
    setState('connecting')
    const token = await identity.getToken().catch(() => null)
    if (!mounted.current) return
    const url = new URL('/api/v1/voice', location.href)
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    if (businessId) url.searchParams.set('business_id', businessId)
    const socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    const audio = new AudioContext()
    const current: VoiceRuntime = { socket, audio, next: 0 }
    runtime.current = current
    socket.onopen = () => {
      if (token) socket.send(JSON.stringify({ kind: 'authenticate', token }))
    }
    socket.onmessage = async (message: MessageEvent<string | ArrayBuffer>) => {
      if (runtime.current !== current) return
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
        if (event.kind === 'error')
          throw new Error('Voice connection unavailable. Use text or retry.')
        eventRef.current(event)
        if (event.kind === 'ready') {
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
          clearTimeout(current.deadline)
          current.deadline = setTimeout(
            stop,
            Math.max(100, (current.next - audio.currentTime) * 1000 + 100),
          )
        }
      } catch {
        setError('Microphone or voice service unavailable. Your text conversation stays available.')
        stop()
      }
    }
    socket.onerror = () => {
      setError('Voice connection failed. Retry or use text.')
      stop()
    }
    socket.onclose = () => {
      if (runtime.current === current) stop()
    }
  }
  return { state, error, muted, start, stop, finishRecording, toggleMute }
}
