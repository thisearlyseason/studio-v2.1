import {
  NewsletterBlock,
  NewsletterDraft,
  safeNewsletterUrl,
} from '@/lib/newsletter-content';

export function validNewsletterBlock(value: unknown): value is NewsletterBlock {
  if (!value || typeof value !== 'object') return false;
  const block = value as Record<string, unknown>;
  if (typeof block.id !== 'string' || block.id.length > 100 || typeof block.type !== 'string') return false;
  if (block.type === 'divider') return true;
  if (block.type === 'heading' || block.type === 'paragraph') {
    return typeof block.text === 'string' && block.text.length <= 10_000;
  }
  if (block.type === 'image') {
    return typeof block.url === 'string' && Boolean(safeNewsletterUrl(block.url)) &&
      typeof block.alt === 'string' && block.alt.length <= 300 &&
      (block.caption === undefined || (typeof block.caption === 'string' && block.caption.length <= 500));
  }
  if (block.type === 'button') {
    return typeof block.label === 'string' && block.label.length <= 120 &&
      typeof block.url === 'string' && Boolean(safeNewsletterUrl(block.url));
  }
  return false;
}

export function parseNewsletterDraft(value: unknown): NewsletterDraft | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const previewText = typeof input.previewText === 'string' ? input.previewText.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const blocks = Array.isArray(input.blocks) && input.blocks.every(validNewsletterBlock) ? input.blocks : [];

  if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) return null;
  if (!title || title.length > 200 || blocks.length < 1 || blocks.length > 40) return null;
  if (previewText.length > 300) return null;
  return { subject, previewText, title, blocks };
}
