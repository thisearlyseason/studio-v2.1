import sharp, { type Sharp } from 'sharp';
import { validateMediaSignature } from '@/lib/media-policy';
import { PageError } from './model';

export type ImagePurpose = 'photo' | 'logo';
export type PageImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
export const PAGE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PAGE_IMAGE_MAX_PIXELS = 25_000_000;
export const PAGE_IMAGE_MAX_EDGE = 2048;
type Bounds = { width: number; height?: number };
export type ImageOptimization = {
  originalBytes: number; storedBytes: number; savedBytes: number; width: number; height: number;
  mime: PageImageMime; purpose: ImagePurpose; losslessEncoding: boolean; resized: boolean;
  originalEncodingRetained: boolean;
};
type Output = { bytes: Buffer; mime: PageImageMime; optimization: ImageOptimization };
const animationError = () => new PageError('Animated GIF, WebP and PNG images are not supported. Export a still image; animations are never silently flattened.', 415);
const malformed = () => new PageError('This image is invalid or truncated. Choose a valid static JPEG, PNG, WebP or GIF image.');

/** Remove non-rendering metadata without recompressing already compact rasters.
 * Rendering-critical colour profiles/Adobe colour transforms are retained here.
 * Re-encoded candidates are colour-converted and carry no source metadata.
 */
function cleanContainer(input: Buffer, mime: PageImageMime): Buffer {
  const parts: Buffer[] = [];
  if (mime === 'image/png') {
    parts.push(input.subarray(0, 8));
    const keep = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD']);
    for (let p = 8; p < input.length;) {
      if (p + 12 > input.length) throw malformed();
      const length = input.readUInt32BE(p), end = p + length + 12;
      if (end > input.length) throw malformed();
      const type = input.toString('ascii', p + 4, p + 8);
      if (['acTL', 'fcTL', 'fdAT'].includes(type)) throw animationError();
      if (keep.has(type)) parts.push(input.subarray(p, end));
      if (type === 'IEND') return Buffer.concat(parts);
      p = end;
    }
    throw malformed();
  }
  if (mime === 'image/webp') {
    const end = input.readUInt32LE(4) + 8;
    if (end > input.length || end < 12) throw malformed();
    for (let p = 12; p < end;) {
      if (p + 8 > end) throw malformed();
      const type = input.toString('ascii', p, p + 4), size = input.readUInt32LE(p + 4), next = p + 8 + size + (size & 1);
      if (next > end) throw malformed();
      if (['ANIM', 'ANMF'].includes(type) || (type === 'VP8X' && (input[p + 8] & 2))) throw animationError();
      if (['VP8X', 'VP8 ', 'VP8L', 'ALPH', 'ICCP'].includes(type)) {
        const chunk = Buffer.from(input.subarray(p, next));
        if (type === 'VP8X') { if (size !== 10) throw malformed(); chunk[8] &= ~12; }
        parts.push(chunk);
      }
      p = next;
    }
    const body = Buffer.concat([Buffer.from('WEBP'), ...parts]), header = Buffer.alloc(8);
    header.write('RIFF'); header.writeUInt32LE(body.length, 4);
    return Buffer.concat([header, body]);
  }
  if (mime === 'image/jpeg') {
    parts.push(input.subarray(0, 2));
    let p = 2;
    while (p < input.length) {
      const start = p;
      if (input[p++] !== 255) throw malformed();
      while (input[p] === 255) p++;
      const marker = input[p++];
      if (marker === 217) { parts.push(input.subarray(start, p)); return Buffer.concat(parts); }
      if (marker === 1 || (marker >= 208 && marker <= 215)) { parts.push(input.subarray(start, p)); continue; }
      if (p + 2 > input.length) throw malformed();
      const length = input.readUInt16BE(p), end = p + length;
      if (length < 2 || end > input.length) throw malformed();
      const icc = marker === 226 && input.toString('ascii', p + 2, p + 14) === 'ICC_PROFILE\0';
      const adobe = marker === 238 && input.toString('ascii', p + 2, p + 7) === 'Adobe';
      if (!(marker >= 224 && marker <= 239) && marker !== 254 || icc || adobe) parts.push(input.subarray(start, end));
      p = end;
      if (marker === 218) {
        const scan = p;
        while (p < input.length) {
          if (input[p] !== 255) { p++; continue; }
          let next = p + 1;
          while (input[next] === 255) next++;
          if (input[next] === 0 || (input[next] >= 208 && input[next] <= 215)) { p = next + 1; continue; }
          break;
        }
        parts.push(input.subarray(scan, p));
      }
    }
    throw malformed();
  }
  // GIF image data and graphic control extensions preserve palette/transparency.
  if (input.length < 14) throw malformed();
  let p = 13 + (input[10] & 128 ? 3 * 2 ** ((input[10] & 7) + 1) : 0), frames = 0;
  if (p > input.length) throw malformed();
  parts.push(input.subarray(0, p));
  function blocks(at: number) {
    while (at < input.length) { const size = input[at++]; if (at + size > input.length) throw malformed(); at += size; if (!size) return at; }
    throw malformed();
  }
  while (p < input.length) {
    const start = p, tag = input[p++];
    if (tag === 59) { parts.push(input.subarray(start, p)); return Buffer.concat(parts); }
    if (tag === 33) {
      const extension = input[p++];
      const profile = extension === 255 && input[p] === 11 && input.toString('ascii', p + 1, p + 12) === 'ICCRGBG1012';
      p = blocks(p);
      if (extension === 249 || profile) parts.push(input.subarray(start, p));
    } else if (tag === 44) {
      if (++frames > 1) throw animationError();
      if (start + 10 > input.length) throw malformed();
      const flags = input[start + 9]; p = start + 10 + (flags & 128 ? 3 * 2 ** ((flags & 7) + 1) : 0);
      if (p >= input.length) throw malformed();
      p = blocks(p + 1); parts.push(input.subarray(start, p));
    } else throw malformed();
  }
  throw malformed();
}

async function optimize(input: Buffer, mime: PageImageMime, purpose: ImagePurpose, bounds: Bounds): Promise<Output> {
  if (!input.length || input.length > PAGE_IMAGE_MAX_BYTES) throw new PageError('Choose an image up to 5 MB.', 413);
  validateMediaSignature(input, mime, false);
  const cleaned = cleanContainer(input, mime);
  const source = sharp(input, { limitInputPixels: PAGE_IMAGE_MAX_PIXELS, failOn: 'warning', animated: true }).timeout({ seconds: 12 });
  const metadata = await source.metadata();
  if ((metadata.pages || 1) > 1) throw animationError();
  const width = metadata.width || 0, height = metadata.height || 0;
  if (!width || !height || width * height > PAGE_IMAGE_MAX_PIXELS) throw new PageError('Choose an image up to 25 megapixels.');
  const swapped = (metadata.orientation || 1) >= 5;
  const originalWidth = swapped ? height : width, originalHeight = swapped ? width : height;
  const fits = originalWidth <= bounds.width && (!bounds.height || originalHeight <= bounds.height);
  const lossless = purpose === 'logo' || metadata.hasAlpha;
  const pipeline = source.clone().rotate().resize({ ...bounds, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb');
  const candidates: Array<{ bytes: Buffer; mime: PageImageMime; width: number; height: number; lossless: boolean; original: boolean }> = [];
  async function candidate(image: Sharp, type: PageImageMime, exact: boolean) {
    const { data, info } = await image.timeout({ seconds: 12 }).toBuffer({ resolveWithObject: true });
    candidates.push({ bytes: data, mime: type, width: info.width, height: info.height, lossless: exact, original: false });
  }
  // Full decode is required even when a cleaned original wins; metadata alone is
  // insufficient validation of truncated/corrupt compressed image data.
  if (lossless && metadata.depth === 'ushort') {
    await candidate(pipeline.clone().toColourspace('rgb16').png({ compressionLevel: 9 }), 'image/png', true);
  } else {
    await candidate(pipeline.clone().webp(lossless ? { lossless: true, effort: 5 } : { quality: 86, alphaQuality: 100, effort: 5, smartSubsample: true }), 'image/webp', lossless);
    if (lossless) await candidate(pipeline.clone().png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }), 'image/png', true);
    else await candidate(pipeline.clone().jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: '4:4:4' }), 'image/jpeg', false);
  }
  if (fits && (!metadata.orientation || metadata.orientation === 1)) candidates.push({ bytes: cleaned, mime, width: originalWidth, height: originalHeight, lossless: true, original: true });
  const best = candidates.filter(c => c.bytes.length <= input.length).sort((a, b) => a.bytes.length - b.bytes.length || Number(b.original) - Number(a.original))[0];
  if (!best) throw new PageError('This tightly compressed image needs resizing or rotation, but a safe conversion would increase its size. Export an optimized still image within 2048 pixels and upload it again.', 422);
  return { bytes: best.bytes, mime: best.mime, optimization: { originalBytes: input.length, storedBytes: best.bytes.length, savedBytes: input.length - best.bytes.length, width: best.width, height: best.height, mime: best.mime, purpose, losslessEncoding: best.lossless, resized: best.width !== originalWidth || best.height !== originalHeight, originalEncodingRetained: best.original } };
}

export async function optimizePageUpload(input: Buffer, mime: PageImageMime, purpose: ImagePurpose = 'photo'): Promise<Output> {
  try { return await optimize(input, mime, purpose, { width: PAGE_IMAGE_MAX_EDGE, height: PAGE_IMAGE_MAX_EDGE }); }
  catch (error) { if (error instanceof PageError) throw error; throw new PageError('This image could not be decoded safely. Choose a valid static image up to 25 megapixels.'); }
}

export async function pageImageVariant(input: Buffer, mime: PageImageMime, purpose: ImagePurpose, width: number) {
  try {
    const meta = await sharp(input, { limitInputPixels: PAGE_IMAGE_MAX_PIXELS }).metadata();
    // Do not re-encode or upscale already-small originals. Legacy animation is
    // served intact; uploads reject it explicitly instead of dropping frames.
    if ((meta.pages || 1) > 1 || (meta.width || 0) <= width) return { bytes: input, mime };
    return await optimize(input, mime, purpose, { width });
  } catch (error) {
    if (error instanceof PageError && [415, 422].includes(error.status)) return { bytes: input, mime };
    throw error;
  }
}
