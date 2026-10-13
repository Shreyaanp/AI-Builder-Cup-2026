/* Converts microphone samples to bounded signed 16-bit PCM at 16 kHz. */
/* global AudioWorkletProcessor, registerProcessor, sampleRate */
class CaptureProcessor extends AudioWorkletProcessor {
  position = 0
  process(inputs) {
    const samples = inputs[0]?.[0]
    if (!samples) return true
    const output = []
    const step = sampleRate / 16000
    while (this.position < samples.length) {
      const value = Math.max(-1, Math.min(1, samples[Math.floor(this.position)]))
      output.push(value < 0 ? value * 32768 : value * 32767)
      this.position += step
    }
    this.position -= samples.length
    const pcm = new Int16Array(output)
    this.port.postMessage(pcm.buffer, [pcm.buffer])
    return true
  }
}
registerProcessor('pcm-capture', CaptureProcessor)
