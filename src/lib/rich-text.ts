export function escapeRichTextHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
export function isSafeRichTextUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function renderSafeRichTextInline(value: string): string {
  return escapeRichTextHtml(value)
    .replace(/!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" style="display:block;max-width:100%;height:auto;margin:16px auto;border-radius:14px;" />')
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#c91f26;text-decoration:underline;">$1</a>')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

export function richTextMarkdownToEditorHtml(value: string): string {
  const lines = value.split(/\r?\n/);
  const output: string[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (!listItems.length) return;
    output.push(`<ul>${listItems.map(item => `<li>${renderSafeRichTextInline(item)}</li>`).join('')}</ul>`);
    listItems = [];
  };

  lines.forEach(line => {
    if (/^\s*-\s+/.test(line)) {
      listItems.push(line.replace(/^\s*-\s+/, ''));
      return;
    }
    flushList();
    if (line.startsWith('## ')) output.push(`<h2>${renderSafeRichTextInline(line.slice(3))}</h2>`);
    else if (line.trim()) output.push(`<p>${renderSafeRichTextInline(line)}</p>`);
    else output.push('<p><br></p>');
  });
  flushList();
  return output.join('');
}
