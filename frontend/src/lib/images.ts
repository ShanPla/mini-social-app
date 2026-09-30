/*
 * Shrinks a picture in the browser before it is uploaded. Phone photos are
 * often 4000 px across and over the 5 MB bucket limit, so they failed; now
 * the longest edge is capped and the picture is re-encoded.
 *
 * - Opaque pictures become JPEG. Pictures with transparency become WebP, or
 *   PNG where the browser cannot write WebP, so the transparency survives.
 * - The browser applies the EXIF rotation while decoding, so the result stays
 *   upright; re-encoding also drops the metadata itself, GPS location included.
 * - Pictures that are already small and within the size cap go up untouched,
 *   which keeps screenshots crisp.
 * - GIFs are never touched (the animation would be lost), and anything the
 *   browser cannot decode (HEIC on desktop Chrome, say) goes up as it is, so
 *   the server refuses it with its usual message.
 */

/* Longest edge in pixels, per place a picture is shown */
export const IMAGE_MAX_EDGE = {
  post: 2048,
  chat: 1600,
  avatar: 1024,
} as const;

/* Under this, a picture that already fits is left alone */
const SMALL_ENOUGH_BYTES = 1.5 * 1024 * 1024;
const QUALITY = 0.85;
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function decode(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  return img.decode().then(
    () => { URL.revokeObjectURL(url); return img; },
    (err) => { URL.revokeObjectURL(url); throw err; },
  );
}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const pixels = ctx.getImageData(0, 0, width, height).data;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 255) return true;
  }
  return false;
}

export async function shrinkImage(file: File, maxEdge: number): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

  let img: HTMLImageElement;
  try {
    img = await decode(file);
  } catch {
    return file;
  }

  const { naturalWidth: w0, naturalHeight: h0 } = img;
  if (!w0 || !h0) return file;
  const scale = Math.min(1, maxEdge / Math.max(w0, h0));
  if (scale === 1 && file.size <= SMALL_ENOUGH_BYTES) return file;

  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  let blob: Blob | null;
  if (file.type !== 'image/jpeg' && hasTransparency(ctx, width, height)) {
    blob = await encode(canvas, 'image/webp', QUALITY);
    if (!blob || blob.type !== 'image/webp') blob = await encode(canvas, 'image/png');
  } else {
    blob = await encode(canvas, 'image/jpeg', QUALITY);
  }
  /* Let the browser drop the bitmap now rather than at the next collection */
  canvas.width = 0;
  canvas.height = 0;

  if (!blob) return file;
  /* Same dimensions and no smaller: the original was better */
  if (scale === 1 && blob.size >= file.size) return file;

  const base = file.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${base}.${EXTENSION[blob.type] ?? 'jpg'}`, { type: blob.type, lastModified: Date.now() });
}
