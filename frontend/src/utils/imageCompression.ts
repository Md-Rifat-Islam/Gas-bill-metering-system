// src/utils/imageCompression.ts
//
// Client-side image compression before upload. Runs entirely in the
// browser via <canvas> — no extra dependency required. Used by
// PhotoCapture (meter reading photos) and ProofInput (payment proofs)
// to shrink typical 2-3MB phone-camera photos down to ~1MB or less
// before they ever leave the browser.

export interface CompressOptions {
  /** Max output width in px. Images larger than this are downscaled. */
  maxWidth?: number
  /** Max output height in px. */
  maxHeight?: number
  /** Initial JPEG quality, 0-1. Lowered automatically if still over maxSizeMB. */
  quality?: number
  /** Target max size in MB. Quality is stepped down until under this (or quality floor is hit). */
  maxSizeMB?: number
}

const DEFAULTS: Required<CompressOptions> = {
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.7,
  maxSizeMB: 1,
}

/**
 * Compresses an image File to a JPEG under roughly `maxSizeMB`, scaled to
 * fit within maxWidth x maxHeight (aspect ratio preserved, never upscaled).
 *
 * Non-image files (e.g. a PDF payment proof) are returned unchanged.
 * If compression fails for any reason (unsupported format, decode error),
 * the original file is returned rather than blocking the upload.
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const { maxWidth, maxHeight, quality, maxSizeMB } = { ...DEFAULTS, ...options }

  if (!file.type.startsWith('image/')) return file

  // Nothing to do if it's already small enough — skip the decode/encode
  // round-trip entirely.
  if (file.size <= maxSizeMB * 1024 * 1024) return file

  try {
    const bitmap = await createImageBitmap(file)

    let { width, height } = bitmap
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    // Step quality down until under the target size, or until quality
    // floor (0.3) is reached — whichever comes first. Avoids an endless
    // loop on images that just can't get small enough via quality alone
    // (in which case the downscale above is doing most of the work).
    let blob: Blob | null = null
    let q = quality
    do {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', q)
      )
      q -= 0.1
    } while (blob && blob.size > maxSizeMB * 1024 * 1024 && q > 0.3)

    if (!blob) return file

    return new File(
      [blob],
      file.name.replace(/\.\w+$/, '.jpg'),
      { type: 'image/jpeg', lastModified: Date.now() }
    )
  } catch {
    // Decode failed, canvas unsupported, etc. — don't block the upload.
    return file
  }
}