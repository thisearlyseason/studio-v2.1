export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const RASTER_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

const RASTER_IMAGE_TYPES = new Set(RASTER_IMAGE_ACCEPT.split(','));

export function validateRasterImage(file: Pick<File, 'size' | 'type'>): string | null {
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) return 'Image exceeds the 5 MB limit.';
  if (!RASTER_IMAGE_TYPES.has(file.type)) return 'Use a JPEG, PNG, WebP, or GIF image.';
  return null;
}
