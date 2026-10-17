# Face check fixture recordings

Three-second browser recordings used by `tests/test_face_worker.py` to check that the face
worker decodes what phones actually upload, and (when the models are fetched) that it finds one
live person in them.

| File                        | Container      | Codec | How it was made                                                      |
| --------------------------- | -------------- | ----- | -------------------------------------------------------------------- |
| `chrome-vp8.webm`           | WebM           | VP8   | Chrome `MediaRecorder`, `video/webm;codecs=vp8` (Android Chrome's)   |
| `chrome-vp9.webm`           | WebM           | VP9   | Chrome `MediaRecorder`, `video/webm;codecs=vp9`                      |
| `chrome-h264.mp4`           | fragmented MP4 | H.264 | Chrome `MediaRecorder`, `video/mp4;codecs=avc1` (Safari's container) |
| `h264-portrait-rotated.mp4` | fragmented MP4 | H.264 | `chrome-h264.mp4` re-encoded sideways with a 90° display matrix      |

The recordings use FaceDialog's settings: `getUserMedia` front camera with an ideal 640x480,
`videoBitsPerSecond: 500000`, `start(250)`. Chrome's fake camera played frames 60-180 of the
public Xiph.org test sequence `foreman_cif.y4m` (https://media.xiph.org/video/derf/), scaled
to 640x480. That clip has one face, head turns of about ±25° and a steady downward pitch.

The rotated file stands in for a phone held upright: the coded frames are sideways and the
display matrix says to turn them back, which is how AVFoundation-based recorders store
portrait video. A worker that ignores the matrix sees no face.
