// Resize large phone photos before they reach the hosting request-body limit.
export function prepareTeamLogo(file: File): Promise<File> {
  return prepareTeamImage(file, 'logo', 1024);
}

export function prepareTeamCover(file: File): Promise<File> {
  return prepareTeamImage(file, 'cover', 1920);
}

async function prepareTeamImage(file: File, kind: 'logo' | 'cover', edge: number): Promise<File> {
  if (!/\.(jpe?g|png|webp|gif|hei[cf])$/i.test(file.name) && !/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(file.type)) {
    throw new Error('Choose a JPEG, PNG, WebP, GIF, or a phone photo your browser can open.');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); }
    catch { throw new Error('This photo could not be opened. Try a JPEG or PNG copy.'); }
    if (kind === 'cover' && (image.naturalWidth < 320 || image.naturalHeight < 160)) throw new Error('Choose a cover at least 320 × 160 pixels.');
    const minimumScale = kind === 'cover' ? Math.max(320 / image.naturalWidth, 160 / image.naturalHeight) : 0;
    const scale = Math.min(1, Math.max(minimumScale, edge / Math.max(image.naturalWidth, image.naturalHeight)));
    if (scale === 1 && file.size <= 1024 * 1024 && ['image/png','image/jpeg','image/gif','image/webp'].includes(file.type)) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the image. Try a smaller PNG or JPEG.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.86));
    if (kind === 'cover' && (!blob || blob.size > 4 * 1024 * 1024)) {
      blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    }
    if (!blob || blob.size > 4 * 1024 * 1024) throw new Error('Try a smaller PNG or JPEG image.');
    return new File([blob], kind + (blob.type === 'image/jpeg' ? '.jpg' : blob.type === 'image/webp' ? '.webp' : '.png'), { type: blob.type });
  } finally { URL.revokeObjectURL(url); }
}
