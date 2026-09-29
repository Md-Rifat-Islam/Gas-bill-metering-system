// src/utils/imageCompression.ts
//
// Client-side image compression + WebP conversion before upload. Runs
// entirely in the browser via <canvas> — no extra dependency required.
// Used by PhotoCapture (meter reading photos), ProofInput / PaymentModal
// (staff payment proofs) and PortalPaymentPage (customer proofs).
//
// Output is WebP. Browsers that can't encode WebP from a canvas (older
// Safari silently returns PNG) fall back to JPEG; the backend then
// re-encodes whatever arrives to WebP (see backend core/image_utils.py),
// so the stored file is always .webp regardless of the browser.

export interface CompressOptions {
  /** Max output width in px. Images larger than this are downscaled. */
  maxWidth?: number
  /** Max output height in px. */
  maxHeight?: number
  /** Initial encode quality, 0-1. Lowered automatically if still over maxSizeMB. */
  quality?: number
  /** Target max size in MB. Quality is stepped down until under this (or the floor is hit). */
  maxSizeMB?: number
}

const DEFAULTS: Required<CompressOptions> = {
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.7,
  maxSizeMB: 1,
}

const QUALITY_FLOOR = 0.4

/** Recommended presets — pass as `compressImage(file, PRESETS.meter)`. */
export const PRESETS = {
  /** Meter dial photos: digits must stay readable, so keep quality higher. */
  meter: { maxWidth: 1600, maxHeight: 1600, quality: 0.8, maxSizeMB: 1 } as CompressOptions,
  /** Payment screenshots / receipts. */
  proof: { maxWidth: 1600, maxHeight: 1600, quality: 0.75, maxSizeMB: 1 } as CompressOptions,
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    // Apply EXIF rotation so phone photos aren't saved sideways.
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return await createImageBitmap(file)
  }
}

/**
 * Compresses an image File to WebP under roughly `maxSizeMB`, scaled to fit
 * within maxWidth x maxHeight (aspect ratio preserved, never upscaled).
 *
 * - Non-image files (e.g. a PDF payment proof) are returned unchanged.
 * - An image that is already WebP, within the size limit and within the
 *   dimension limits is returned unchanged (avoids re-encoding twice).
 * - If anything fails (unsupported format, decode error), the original file
 *   is returned rather than blocking the upload — the server validates and
 *   converts it anyway.
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const { maxWidth, maxHeight, quality, maxSizeMB } = { ...DEFAULTS, ...options }
  const maxBytes = maxSizeMB * 1024 * 1024

  if (!file.type.startsWith('image/')) return file
  // Leave vector / animated formats alone.
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file

  try {
    const bitmap = await decode(file)

    let { width, height } = bitmap
    const needsResize = width > maxWidth || height > maxHeight

    if (file.type === 'image/webp' && !needsResize && file.size <= maxBytes) {
      bitmap.close?.()
      return file
    }

    if (needsResize) {
      const ratio = Math.min(maxWidth / width, maxHeight / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close?.()
      return file
    }

    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    // Try WebP first. If the browser can't encode it, toBlob hands back a
    // PNG (blob.type !== 'image/webp') — in that case use JPEG instead.
    let outType = 'image/webp'
    let blob = await toBlob(canvas, outType, quality)
    if (!blob || blob.type !== 'image/webp') {
      outType = 'image/jpeg'
      blob = await toBlob(canvas, outType, quality)
    }

    // Step quality down until under the target size or the floor is hit.
    let q = quality
    while (blob && blob.size > maxBytes && q - 0.1 >= QUALITY_FLOOR) {
      q = Math.round((q - 0.1) * 100) / 100
      blob = await toBlob(canvas, outType, q)
    }

    if (!blob) return file

    const ext = outType === 'image/webp' ? 'webp' : 'jpg'
    const base = file.name.replace(/\.[^./\\]+$/, '') || 'photo'
    return new File([blob], `${base}.${ext}`, { type: outType, lastModified: Date.now() })
  } catch {
    // Decode failed, canvas unsupported, etc. — don't block the upload.
    return file
  }
}