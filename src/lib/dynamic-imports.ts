/**
 * Dynamic import helpers for heavy libraries.
 * Use these instead of top-level imports to keep initial JS bundles lean.
 * Each function is cached after the first call via module-level promise storage.
 */

let _jspdfPromise: Promise<typeof import('jspdf')> | null = null;
export function loadJsPDF() {
  if (!_jspdfPromise) _jspdfPromise = import('jspdf');
  return _jspdfPromise;
}

let _html2canvasPromise: Promise<typeof import('html2canvas')> | null = null;
export function loadHtml2Canvas() {
  if (!_html2canvasPromise) _html2canvasPromise = import('html2canvas');
  return _html2canvasPromise;
}
