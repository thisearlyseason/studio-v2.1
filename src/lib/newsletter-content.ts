export type NewsletterBlock =
  | { id: string; type: 'heading'; text: string }
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'image'; url: string; alt: string; caption?: string }
  | { id: string; type: 'button'; label: string; url: string }
  | { id: string; type: 'divider' };

export type NewsletterDraft = {
  subject: string;
  previewText?: string;
  title: string;
  blocks: NewsletterBlock[];
};

export function escapeNewsletterHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function safeNewsletterUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function renderInline(text: string): string {
  return escapeNewsletterHtml(text)
    .replace(/!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" style="display:block;width:100%;max-width:640px;height:auto;margin:18px auto;border-radius:18px;">')
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" style="color:#c91f26;text-decoration:underline;">$1</a>')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

function renderParagraph(text: string): string {
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.filter(line => line.trim());
  if (nonEmpty.length > 0 && nonEmpty.every(line => /^\s*-\s+/.test(line))) {
    const items = nonEmpty
      .map(line => `<li style="margin:0 0 8px;">${renderInline(line.replace(/^\s*-\s+/, ''))}</li>`)
      .join('');
    return `<ul style="margin:0 0 24px;padding-left:24px;color:#303038;font-size:16px;line-height:1.65;">${items}</ul>`;
  }

  return text
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map(paragraph => `<p style="margin:0 0 22px;color:#303038;font-size:16px;line-height:1.75;">${renderInline(paragraph).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
}

export function renderNewsletterBlock(block: NewsletterBlock): string {
  if (block.type === 'heading') {
    return `<h2 style="margin:30px 0 14px;color:#111118;font-size:26px;line-height:1.2;letter-spacing:-0.02em;">${renderInline(block.text)}</h2>`;
  }
  if (block.type === 'paragraph') return renderParagraph(block.text);
  if (block.type === 'divider') {
    return '<hr style="border:0;border-top:1px solid #e5e5e8;margin:30px 0;">';
  }
  if (block.type === 'image') {
    const url = safeNewsletterUrl(block.url);
    if (!url) return '';
    const caption = block.caption?.trim()
      ? `<p style="margin:9px 0 24px;color:#74747d;font-size:12px;line-height:1.5;text-align:center;">${escapeNewsletterHtml(block.caption)}</p>`
      : '<div style="height:24px;"></div>';
    return `<img src="${escapeNewsletterHtml(url)}" alt="${escapeNewsletterHtml(block.alt || 'Newsletter image')}" style="display:block;width:100%;max-width:640px;height:auto;border-radius:18px;">${caption}`;
  }

  const url = safeNewsletterUrl(block.url);
  if (!url || !block.label.trim()) return '';
  return `<div style="margin:30px 0;text-align:center;"><a href="${escapeNewsletterHtml(url)}" style="display:inline-block;background:#c91f26;color:#ffffff;text-decoration:none;padding:15px 28px;border-radius:999px;font-size:14px;font-weight:800;letter-spacing:0.04em;">${escapeNewsletterHtml(block.label)}</a></div>`;
}

export function renderNewsletterHtml(
  draft: NewsletterDraft,
  unsubscribeUrl = '{{{RESEND_UNSUBSCRIBE_URL}}}'
): string {
  const preview = escapeNewsletterHtml(draft.previewText || 'Updates from The Squad');
  const content = draft.blocks.map(renderNewsletterBlock).join('');
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f3f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f3f5;padding:24px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:24px;overflow:hidden;">
      <tr><td style="height:8px;background:#c91f26;"></td></tr>
      <tr><td style="padding:34px 38px 12px;">
        <div style="font-size:13px;font-weight:900;letter-spacing:0.2em;color:#c91f26;text-transform:uppercase;">THE SQUAD</div>
        <h1 style="margin:14px 0 26px;color:#09090b;font-size:38px;line-height:1.08;letter-spacing:-0.04em;">${escapeNewsletterHtml(draft.title)}</h1>
        ${content}
      </td></tr>
      <tr><td style="padding:28px 38px;background:#111118;text-align:center;color:#b7b7bf;font-size:12px;line-height:1.6;">
        You received this because you subscribed to The Squad newsletter.<br>
        <a href="${escapeNewsletterHtml(unsubscribeUrl)}" style="color:#ffffff;text-decoration:underline;">Unsubscribe</a> at any time.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function renderNewsletterText(
  draft: NewsletterDraft,
  unsubscribeUrl = '{{{RESEND_UNSUBSCRIBE_URL}}}'
): string {
  const body = draft.blocks.map(block => {
    if (block.type === 'divider') return '---';
    if (block.type === 'image') return block.caption || block.alt || block.url;
    if (block.type === 'button') return `${block.label}: ${block.url}`;
    return block.text.replace(/\*\*/g, '').replace(/\*/g, '');
  }).join('\n\n');
  return `${draft.title}\n\n${body}\n\nUnsubscribe: ${unsubscribeUrl}`;
}
