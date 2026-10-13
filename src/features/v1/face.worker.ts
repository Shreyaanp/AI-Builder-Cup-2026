import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
let model: FaceLandmarker | null = null
self.onmessage = async (event: MessageEvent<{ kind: string; bitmap?: ImageBitmap }>) => {
  try {
    if (event.data.kind === 'init') {
      const vision = await FilesetResolver.forVisionTasks('/mediapipe')
      model = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 2,
      })
      self.postMessage({ kind: 'ready' })
    } else if (model && event.data.bitmap) {
      const result = model.detect(event.data.bitmap)
      self.postMessage({ kind: 'guidance', faces: result.faceLandmarks.length })
    }
  } catch {
    self.postMessage({ kind: 'unavailable' })
  } finally {
    event.data.bitmap?.close()
  }
}
