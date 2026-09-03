/**
 * Elfsight's styled-components runtime throws when WebKit cannot recover the
 * CSSStyleSheet associated with its injected style element. All iOS browsers
 * use WebKit, even when their user agent advertises a different browser brand.
 */
export function shouldUseNativeChatFallback(userAgent: string): boolean {
  const isWebKit = /AppleWebKit/i.test(userAgent);
  const isBlinkBrowser = /(Chrome|Chromium|Edg|OPR|Android)/i.test(userAgent);

  return isWebKit && !isBlinkBrowser;
}
