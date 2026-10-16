import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

// MediaPipe's loader is a classic, non-strict script that declares globals (ModuleFactory and its
// helpers). A module worker cannot importScripts it, and import() runs it as a strict module with
// module-scoped names ("ModuleFactory not set"), so guidance never started. MediaPipe calls
// self.import when importScripts fails: run the same-origin loader as a classic global script.
;(self as unknown as { import: (url: string) => Promise<void> }).import = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Guidance engine unavailable')
  ;(0, eval)(await response.text())
}

let model: FaceLandmarker | null = null
self.onmessage = async (event: MessageEvent<{ kind: string; bitmap?: ImageBitmap }>) => {
  try {
    if (event.data.kind === 'init') {
      // An absolute URL: the dev server rewrites root-relative dynamic imports.
      const vision = await FilesetResolver.forVisionTasks(
        new URL('/mediapipe', self.location.origin).href,
      )
      model = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 2,
      })
      self.postMessage({ kind: 'ready' })
    } else if (model && event.data.bitmap) {
      const result = model.detect(event.data.bitmap)
      const faces = result.faceLandmarks.length
      // Size of the face box (share of the frame width), to ask the owner to come closer.
      const xs = result.faceLandmarks[0]?.map((point) => point.x) ?? []
      const width = xs.length ? Math.max(...xs) - Math.min(...xs) : 0
      self.postMessage({ kind: 'guidance', faces, width })
    }
  } catch {
    self.postMessage({ kind: 'unavailable' })
  } finally {
    event.data.bitmap?.close()
  }
}
