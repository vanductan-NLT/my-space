/*
 * Pasted or dropped images are stored inside the document as data URLs, so
 * they live in IndexedDB with the text, travel in backups and exports, and need
 * no server. To keep documents light they are scaled down and re-encoded first.
 */

const MAX_SIDE = 1600
const MAX_INPUT_BYTES = 15 * 1024 * 1024
const KEEP_AS_IS_BYTES = 300 * 1024

export class ImageTooLargeError extends Error {
  constructor() {
    super('This image is larger than 15 MB. Try a smaller one.')
  }
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

export const isImageFile = (file: File) => file.type.startsWith('image/')

export async function imageFileToDataUrl(file: File): Promise<string> {
  if (file.size > MAX_INPUT_BYTES) throw new ImageTooLargeError()
  // Animated GIFs and SVGs would lose what makes them what they are; small
  // images don't need the work.
  if (file.type === 'image/gif' || file.type === 'image/svg+xml' || file.size <= KEEP_AS_IS_BYTES) {
    return readAsDataUrl(file)
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.85))
  // Keep the original if re-encoding didn't help (or isn't supported).
  return readAsDataUrl(blob && blob.size < file.size ? blob : file)
}
