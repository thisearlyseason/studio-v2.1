import sharp from 'sharp';
export const COVER_MAX_BYTES = 5 * 1024 * 1024;
export const COVER_WIDTHS = [640, 1280, 1920];
export async function optimizeTeamCover(input: Buffer) {
  if (!input.length || input.length > COVER_MAX_BYTES) throw new Error('Choose an image up to 5 MB.');
  const options = { limitInputPixels: 40_000_000, failOn: 'error' as const };
  const metadata = await sharp(input, options).metadata();
  if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format || '')) throw new Error('Use a JPEG, PNG, WebP, or GIF photo.');
  if (!metadata.width || !metadata.height || metadata.width < 320 || metadata.height < 160) throw new Error('Choose an image at least 320 × 160 pixels.');
  // rotate() applies EXIF orientation. Sharp strips metadata by default.
  const oriented = await sharp(input, options).rotate().toBuffer({ resolveWithObject: true });
  const widths = [...new Set(COVER_WIDTHS.map(width => Math.min(width, oriented.info.width)))];
  const versions = await Promise.all(widths.map(async width => {
    const targetBytes = width <= 640 ? 100_000 : width <= 1280 ? 300_000 : 500_000;
    let result = await sharp(oriented.data, options).resize({ width, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80, effort: 4 }).toBuffer({ resolveWithObject: true });
    if (result.data.length > targetBytes) result = await sharp(oriented.data, options).resize({ width, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 74, effort: 4 }).toBuffer({ resolveWithObject: true });
    return { width: result.info.width, data: result.data };
  }));
  return versions.filter((version, index) => versions.findIndex(other => other.width === version.width) === index);
}
export function coverFocalPoint(x: unknown, y: unknown) {
  const focalX = Number(x), focalY = Number(y);
  if (x === null || y === null || !Number.isFinite(focalX) || !Number.isFinite(focalY) || focalX < 0 || focalX > 100 || focalY < 0 || focalY > 100) throw new Error('Image position must be between 0 and 100.');
  return { focalX, focalY };
}
