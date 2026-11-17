/** Keep the rendered title within the audit range without cutting a title mid-thought. */
export function pageTitle(value: string): { absolute: string } {
  const title = value.trim();
  if (title.length > 60) console.warn(`[SEO] Title needs an editorial rewrite (${title.length} characters): ${title}`);
  const suffix = ' | The Squad';
  return { absolute: title.includes('The Squad') || title.length + suffix.length > 60 ? title : `${title}${suffix}` };
}

export function pageDescription(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length >= 110 && text.length <= 160) return text;
  if (text.length > 160) {
    const sentence = text.match(/^.{109,158}?[.!?](?=\s|$)/)?.[0];
    if (sentence) return sentence;
    const words = text.slice(0, 157).replace(/\s+\S*$/, '').replace(/[,;:—–-]+$/, '').trim();
    return `${words}.`;
  }
  return text;
}
