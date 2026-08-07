'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Bold, Heading2, Image as ImageIcon, Italic, Link2, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { isSafeRichTextUrl, richTextMarkdownToEditorHtml } from '@/lib/rich-text';

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
  ariaLabel: string;
};

type SelectionBookmark = {
  start: number;
  end: number;
};

function getSelectionBookmark(editor: HTMLDivElement): SelectionBookmark | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;

  const beforeStart = range.cloneRange();
  beforeStart.selectNodeContents(editor);
  beforeStart.setEnd(range.startContainer, range.startOffset);

  const beforeEnd = range.cloneRange();
  beforeEnd.selectNodeContents(editor);
  beforeEnd.setEnd(range.endContainer, range.endOffset);

  const maxOffset = editor.textContent?.length || 0;

  return {
    start: Math.min(beforeStart.toString().length, maxOffset),
    end: Math.min(beforeEnd.toString().length, maxOffset),
  };
}

function restoreSelectionBookmark(editor: HTMLDivElement, bookmark: SelectionBookmark): void {
  const range = document.createRange();
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startNode: Node | null = null;
  let endNode: Node | null = null;
  let startOffset = 0;
  let endOffset = 0;
  let node = walker.nextNode();

  while (node) {
    const length = node.textContent?.length || 0;
    if (!startNode && bookmark.start <= offset + length) {
      startNode = node;
      startOffset = Math.max(0, bookmark.start - offset);
    }
    if (!endNode && bookmark.end <= offset + length) {
      endNode = node;
      endOffset = Math.max(0, bookmark.end - offset);
      break;
    }
    offset += length;
    node = walker.nextNode();
  }

  if (!startNode || !endNode) return;
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function serializeNode(node: ChildNode): string {
  if (node.nodeType === 3) return node.textContent || '';
  if (node.nodeType !== 1) return '';
  const element = node as HTMLElement;
  const children = Array.from(element.childNodes).map(serializeNode).join('');
  switch (element.tagName) {
    case 'STRONG':
    case 'B': return `**${children}**`;
    case 'EM':
    case 'I': return `*${children}*`;
    case 'SPAN': {
      const weight = element.style.fontWeight;
      const numericWeight = Number.parseInt(weight, 10);
      const isBold = weight === 'bold' || (!Number.isNaN(numericWeight) && numericWeight >= 600);
      const isItalic = element.style.fontStyle === 'italic';
      if (isBold && isItalic) return `***${children}***`;
      if (isBold) return `**${children}**`;
      if (isItalic) return `*${children}*`;
      return children;
    }
    case 'A': {
      const href = element.getAttribute('href') || '';
      return isSafeRichTextUrl(href) ? `[${children}](${href})` : children;
    }
    case 'IMG': {
      const src = element.getAttribute('src') || '';
      const alt = (element.getAttribute('alt') || 'Newsletter image').replace(/[\[\]]/g, '');
      return isSafeRichTextUrl(src) ? `![${alt}](${src})` : '';
    }
    case 'LI': return `- ${children.trim()}\n`;
    case 'H2': return `## ${children.trim()}\n\n`;
    case 'BR': return '\n';
    case 'P':
    case 'DIV': return `${children.trimEnd()}\n\n`;
    default: return children;
  }
}
function serializeEditor(editor: HTMLDivElement): string {
  return Array.from(editor.childNodes)
    .map(serializeNode)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start writing…',
  minHeightClassName = 'min-h-56',
  ariaLabel,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastEmittedValue = useRef(value);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === lastEmittedValue.current) return;
    editor.innerHTML = richTextMarkdownToEditorHtml(value);
    lastEmittedValue.current = value;
  }, [value]);

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    const next = serializeEditor(editorRef.current);
    lastEmittedValue.current = next;
    onChange(next);
  }, [onChange]);

  const restoreAfterChange = (bookmark: SelectionBookmark | null) => {
    if (!bookmark) return;
    requestAnimationFrame(() => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      restoreSelectionBookmark(editorRef.current, bookmark);
    });
  };

  const runCommand = (command: string, argument?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const bookmark = getSelectionBookmark(editor);
    editor.focus();
    document.execCommand(command, false, argument);
    emitChange();
    restoreAfterChange(bookmark);
  };

  const toggleInlineFormat = (tagName: 'strong' | 'em', fallbackCommand: 'bold' | 'italic') => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    const bookmark = getSelectionBookmark(editor);
    editor.focus();

    if (range.collapsed) {
      document.execCommand(fallbackCommand, false);
    } else {
      const selector = tagName === 'strong' ? 'strong, b' : 'em, i';
      const existingMarks = Array.from(editor.querySelectorAll(selector))
        .filter(mark => range.intersectsNode(mark));

      if (existingMarks.length > 0) {
        existingMarks.forEach(mark => mark.replaceWith(...Array.from(mark.childNodes)));
      } else {
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        const selectedNodes: Array<{ node: Text; start: number; end: number }> = [];
        let node = walker.nextNode();
        while (node) {
          if (range.intersectsNode(node)) {
            const textNode = node as Text;
            const start = node === range.startContainer ? range.startOffset : 0;
            const end = node === range.endContainer ? range.endOffset : textNode.length;
            if (end > start) selectedNodes.push({ node: textNode, start, end });
          }
          node = walker.nextNode();
        }
        selectedNodes.reverse().forEach(({ node: textNode, start, end }) => {
          const selectedText = textNode.splitText(start);
          selectedText.splitText(end - start);
          const wrapper = document.createElement(tagName);
          selectedText.replaceWith(wrapper);
          wrapper.append(selectedText);
        });
      }
    }

    emitChange();
    restoreAfterChange(bookmark);
  };

  const addLink = () => {
    const url = window.prompt('Enter the secure link URL (https://):', 'https://');
    if (!url) return;
    if (!isSafeRichTextUrl(url)) {
      toast({ title: 'Invalid Link', description: 'Links must use a valid https:// address.', variant: 'destructive' });
      return;
    }
    runCommand('createLink', url);
  };

  const addImage = () => {
    const url = window.prompt('Enter the public image URL (https://):', 'https://');
    if (!url) return;
    if (!isSafeRichTextUrl(url)) {
      toast({ title: 'Invalid Image', description: 'Images must use a public https:// address.', variant: 'destructive' });
      return;
    }
    const alt = (window.prompt('Describe the image for accessibility:', 'Newsletter image') || 'Newsletter image')
      .replace(/[\[\]]/g, '')
      .slice(0, 200);
    editorRef.current?.focus();
    document.execCommand('insertImage', false, url);
    const images = editorRef.current?.querySelectorAll(`img[src="${CSS.escape(url)}"]`);
    images?.forEach(image => image.setAttribute('alt', alt));
    emitChange();
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/50 p-2" role="toolbar" aria-label={`${ariaLabel} formatting`}>
        {[
          { label: 'Bold', icon: Bold, action: () => toggleInlineFormat('strong', 'bold') },
          { label: 'Italic', icon: Italic, action: () => toggleInlineFormat('em', 'italic') },
          { label: 'Heading', icon: Heading2, action: () => runCommand('formatBlock', 'h2') },
          { label: 'Bullet list', icon: List, action: () => runCommand('insertUnorderedList') },
          { label: 'Link', icon: Link2, action: addLink },
          { label: 'Inline image', icon: ImageIcon, action: addImage },
        ].map(({ label, icon: Icon, action }) => (
          <Button
            key={label}
            type="button"
            variant="ghost"
            size="sm"
            onMouseDown={event => event.preventDefault()}
            onClick={action}
            aria-label={label}
            title={label}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
        <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Visual editor</span>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        onInput={emitChange}
        onBlur={emitChange}
        className={`${minHeightClassName} max-h-[640px] overflow-y-auto px-4 py-3 text-sm leading-7 outline-none [&_a]:text-primary [&_a]:underline [&_h2]:my-3 [&_h2]:text-xl [&_h2]:font-black [&_img]:mx-auto [&_img]:my-4 [&_img]:max-h-96 [&_img]:max-w-full [&_img]:rounded-xl [&_li]:ml-6 [&_li]:list-disc [&_p]:my-2 empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]`}
        dangerouslySetInnerHTML={{ __html: richTextMarkdownToEditorHtml(value) }}
      />
    </div>
  );
}
