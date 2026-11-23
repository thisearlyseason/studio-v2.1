// Resize large phone photos before they reach the hosting request-body limit.
export async function prepareTeamLogo(file: File): Promise<File> {
  if (!/\.(jpe?g|png|webp|gif|hei[cf])$/i.test(file.name) && !/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(file.type)) {
    throw new Error('Choose a JPEG, PNG, WebP, GIF, or a phone photo your browser can open.');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); }
    catch { throw new Error('This photo could not be opened. Try a JPEG or PNG copy.'); }
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    if (scale === 1 && file.size <= 1024 * 1024 && ['image/png','image/jpeg','image/gif','image/webp'].includes(file.type)) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the logo. Try a smaller PNG or JPEG.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!blob || blob.size > 4 * 1024 * 1024) throw new Error('Try a smaller PNG or JPEG logo.');
    return new File([blob], blob.type === 'image/webp' ? 'logo.webp' : 'logo.png', { type: blob.type });
  } finally { URL.revokeObjectURL(url); }
}
