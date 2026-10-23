/**
 * Shrinks a phone photo in the browser before it is uploaded. A 12 MP camera JPEG is 3–6 MB; the
 * reader and the server both work from 1600 px on the long side (see backend `MAX_SIDE`), which
 * keeps small menu print legible and is a fraction of the bytes on mobile data.
 */
export const PHOTO_MAX_SIDE = 1600
/** How long the app waits for a photo to be read: production reads took up to 64 s (OB-194). */
export const PHOTO_READ_TIMEOUT_MS = 150_000
const QUALITY = 0.85
/** Photos already this small are sent as they are. */
const SKIP_BELOW_BYTES = 400_000

export type PreparedPhoto = { file: File; gps: string | null }

/** The size to draw at: the long side at most `max`, never enlarged. */
export function fitSize(width: number, height: number, max = PHOTO_MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * `lat,lng` from a JPEG's EXIF GPS block, or null. The canvas drops EXIF, and the server proposes the
 * shop's pin from it, so the browser reads it first and sends it along in a header.
 */
export function exifGps(bytes: Uint8Array): string | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.byteLength < 12 || view.getUint16(0) !== 0xffd8) return null
  let at = 2
  while (at + 4 < view.byteLength) {
    if (view.getUint8(at) !== 0xff) return null
    const marker = view.getUint8(at + 1)
    const length = view.getUint16(at + 2)
    if (marker === 0xe1 && view.getUint32(at + 4) === 0x45786966) return gpsFromTiff(view, at + 10)
    if (marker === 0xda || length < 2) return null
    at += 2 + length
  }
  return null
}

function gpsFromTiff(view: DataView, base: number): string | null {
  try {
    const little = view.getUint16(base) === 0x4949
    const u16 = (o: number) => view.getUint16(base + o, little)
    const u32 = (o: number) => view.getUint32(base + o, little)
    const entry = (ifd: number, tag: number) => {
      const count = u16(ifd)
      for (let i = 0; i < count; i++) {
        const o = ifd + 2 + i * 12
        if (u16(o) === tag) return o
      }
      return -1
    }
    const gpsAt = entry(u32(4), 0x8825)
    if (gpsAt < 0) return null
    const gps = u32(gpsAt + 8)
    const ascii = (tag: number) => {
      const o = entry(gps, tag)
      return o < 0 ? '' : String.fromCharCode(view.getUint8(base + o + 8))
    }
    const degrees = (tag: number) => {
      const o = entry(gps, tag)
      if (o < 0) return null
      const at = u32(o + 8)
      const part = (i: number) => u32(at + i * 8) / (u32(at + i * 8 + 4) || 1)
      return part(0) + part(1) / 60 + part(2) / 3600
    }
    const lat = degrees(2)
    const lng = degrees(4)
    if (lat === null || lng === null) return null
    const north = ascii(1) === 'S' ? -1 : 1
    const east = ascii(3) === 'W' ? -1 : 1
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return `${(north * lat).toFixed(6)},${(east * lng).toFixed(6)}`
  } catch {
    return null
  }
}

/** Resizes to JPEG; falls back to the original when the browser cannot decode or it would grow. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const started = performance.now()
  try {
    const gps =
      file.type === 'image/jpeg'
        ? exifGps(new Uint8Array(await file.slice(0, 131072).arrayBuffer()))
        : null
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const { width, height } = fitSize(bitmap.width, bitmap.height)
    const small = width === bitmap.width && height === bitmap.height
    if (small && file.size < SKIP_BELOW_BYTES && file.type === 'image/jpeg') {
      bitmap.close()
      return { file, gps }
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return { file, gps }
    }
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    )
    if (!blob || blob.size >= file.size) return { file, gps }
    console.debug('photo_prep_ms', {
      ms: Math.round(performance.now() - started),
      from: file.size,
      to: blob.size,
    })
    return { file: new File([blob], 'photo.jpg', { type: 'image/jpeg' }), gps }
  } catch {
    return { file, gps: null }
  }
}

/** Headers for the photo upload: its type, and the location the browser read before shrinking. */
export function photoHeaders(photo: PreparedPhoto): Record<string, string> {
  return photo.gps
    ? { 'Content-Type': photo.file.type, 'X-Photo-Gps': photo.gps }
    : { 'Content-Type': photo.file.type }
}
