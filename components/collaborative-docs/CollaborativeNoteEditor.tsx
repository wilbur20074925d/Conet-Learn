"use client"

/**
 * TipTap editor bound to Y.XmlFragment (Google Docs-style CRDT).
 * Toolbar mirrors Google Docs (English): fonts, sizes, colors, insert image modal, etc.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import { ConetAuthorMark, createAuthorStampPlugin } from '@/lib/collaborative-author-mark';
import conetLearnLogo from '@/components/figure/conet-learn.png';
import {
  CONET_LEARN_TAGLINE,
  generateNotePdfBlob,
  normalizePrintBodyHtml,
  NOTE_PDF_RENDER_WIDTH_PX,
  sanitizePdfFileName,
  type PrintDocumentMode,
} from '@/lib/note-print-pdf';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import {
  buildCollaborationAwarenessUser,
  renderCollaborationCursor,
} from '@/lib/collaboration-cursor-render';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  Image as ImageIcon,
  MessageSquare,
  Highlighter,
  Printer,
  Download,
  Loader2,
  Minus,
  Plus,
  ChevronDown,
  Indent,
  Outdent,
  RemoveFormatting,
  Upload,
  Cloud,
  ClipboardPaste,
  X,
  Check,
  Type,
} from 'lucide-react';

/** Font size via inline style on TextStyle mark. */
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => (element as HTMLElement).style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }: { chain: () => any }) =>
          chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }: { chain: () => any }) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    } as any;
  },
});

/** Inline comment mark — travels with the CRDT document. */
const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) =>
          attrs.commentId ? { 'data-comment-id': attrs.commentId } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'comment-mark bg-amber-100 border-b-2 border-amber-400 cursor-pointer',
      }),
      0,
    ];
  },
});

/** Image with width + horizontal alignment (Google Docs-style). */
const ResizableImage = Image.extend({
  name: 'image',
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '75%',
        parseHTML: (element) =>
          (element as HTMLElement).getAttribute('width') ||
          (element as HTMLElement).style.width ||
          '75%',
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return {
            width: attributes.width,
            style: `width: ${attributes.width}; height: auto;`,
          };
        },
      },
      align: {
        default: 'center',
        parseHTML: (element) =>
          (element as HTMLElement).getAttribute('data-align') || 'center',
        renderHTML: (attributes) => ({
          'data-align': attributes.align || 'center',
          class: `note-img note-img-${attributes.align || 'center'}`,
        }),
      },
    };
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setImage:
        (options: {
          src: string;
          alt?: string;
          title?: string;
          width?: string;
          align?: string;
        }) =>
        ({ commands }: { commands: { insertContent: (value: unknown) => boolean } }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              src: options.src,
              alt: options.alt,
              title: options.title,
              width: options.width || '75%',
              align: options.align || 'center',
            },
          }),
    } as any;
  },
});

const FONT_FAMILIES = [
  { name: 'Arial', value: 'Arial, sans-serif' },
  { name: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { name: 'Georgia', value: 'Georgia, serif' },
  { name: 'Verdana', value: 'Verdana, sans-serif' },
  { name: 'Courier New', value: '"Courier New", Courier, monospace' },
  { name: 'Comic Sans MS', value: '"Comic Sans MS", cursive' },
  { name: 'Trebuchet MS', value: '"Trebuchet MS", Helvetica, sans-serif' },
  { name: 'Calibri', value: 'Calibri, sans-serif' },
  { name: 'Garamond', value: 'Garamond, serif' },
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72];

const TEXT_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff',
  '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
];

const HIGHLIGHT_COLORS = [
  '#ffffff', '#fce8b2', '#fad2cf', '#fde293', '#d9ead3', '#d0e0e3',
  '#cfe2f3', '#d9d2e9', '#ead1dc', '#fff2cc',
];

const STYLE_OPTIONS = [
  { label: 'Normal text', value: 'paragraph' as const },
  { label: 'Title', value: 'heading', level: 1 as const },
  { label: 'Heading 1', value: 'heading', level: 2 as const },
  { label: 'Heading 2', value: 'heading', level: 3 as const },
  { label: 'Heading 3', value: 'heading', level: 4 as const },
];

export interface CollaborativeNoteEditorProps {
  ydoc: Y.Doc;
  fragment?: Y.XmlFragment;
  awareness: Awareness;
  user: { userId: string; name: string; color: string; figureIndex: number };
  editable?: boolean;
  placeholder?: string;
  className?: string;
  seedHtml?: string;
  onSeedConsumed?: () => void;
  onEditorReady?: (editor: Editor) => void;
  onAddCommentRequest?: () => void;
  documentTitle?: string;
  /** When false, formatting toolbar is omitted (parent can render it in sticky chrome). */
  showToolbar?: boolean;
  minHeight?: string;
  /** When false, this editor does not publish a cursor or name to collaborators. */
  publishPresence?: boolean;
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        if (disabled) return;
        onClick();
      }}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition disabled:opacity-40 ${
        active
          ? 'bg-sky-100 text-sky-900'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-4 w-px shrink-0 bg-slate-200" />;
}

function DropdownShell({
  open,
  onClose,
  children,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className={`absolute left-1/2 top-full z-50 mt-1.5 max-h-64 -translate-x-1/2 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-200/80 ring-1 ring-slate-900/5 ${className}`}
      >
        {children}
      </div>
    </>
  );
}

/** Google Docs-style Insert Image panel: Upload / URL / Clipboard. */
const InsertImageModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onInsert: (src: string) => void;
}> = ({ open, onClose, onInsert }) => {
  const [tab, setTab] = useState<'upload' | 'url' | 'clipboard'>('upload');
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setTab('upload');
      setUrl('');
      setPreview(null);
      setError(null);
      setBusy(false);
      setDragOver(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && tab === 'clipboard') {
      pasteRef.current?.focus();
    }
  }, [open, tab]);

  if (!open) return null;

  const readFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (PNG, JPG, GIF, WebP).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Image must be under 8 MB.');
      return;
    }
    setBusy(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(String(reader.result || ''));
      setBusy(false);
    };
    reader.onerror = () => {
      setError('Could not read that file.');
      setBusy(false);
    };
    reader.readAsDataURL(file);
  };

  const insertPreview = () => {
    if (!preview) return;
    onInsert(preview);
    onClose();
  };

  const insertUrl = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Enter an image URL.');
      return;
    }
    onInsert(trimmed);
    onClose();
  };

  const tabs: Array<{ id: typeof tab; label: string; icon: React.ReactNode }> = [
    { id: 'upload', label: 'Upload', icon: <Upload className="h-4 w-4" /> },
    { id: 'url', label: 'By URL', icon: <Cloud className="h-4 w-4" /> },
    { id: 'clipboard', label: 'Clipboard', icon: <ClipboardPaste className="h-4 w-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Insert image</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Upload from your device, paste a cloud link, or use the clipboard.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-100 px-4 pt-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setError(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-semibold transition ${
                tab === t.id
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {tab === 'upload' && (
            <div className="space-y-4">
              <div
                className={`rounded-xl border-2 border-dashed px-4 py-10 text-center transition ${
                  dragOver
                    ? 'border-sky-400 bg-sky-50'
                    : 'border-slate-300 bg-slate-50 hover:border-slate-400'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) readFile(file);
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) readFile(file);
                    e.target.value = '';
                  }}
                />
                <Upload className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                <p className="text-sm font-medium text-slate-800">
                  Drag an image here, or{' '}
                  <button
                    type="button"
                    className="font-semibold text-sky-700 underline"
                    onClick={() => fileRef.current?.click()}
                  >
                    browse
                  </button>
                </p>
                <p className="mt-1 text-xs text-slate-500">PNG, JPG, GIF, or WebP · max 8 MB</p>
              </div>
              {busy && (
                <p className="text-center text-xs text-slate-500">Reading image…</p>
              )}
            </div>
          )}

          {tab === 'url' && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Image link (Drive, Dropbox, CDN, …)
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setPreview(e.target.value.trim() || null);
                  setError(null);
                }}
                placeholder="https://…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <p className="text-xs text-slate-500">
                Paste a publicly reachable URL from Google Drive, Dropbox, Imgur, or your own cloud storage.
              </p>
            </div>
          )}

          {tab === 'clipboard' && (
            <div className="space-y-3">
              <div
                ref={pasteRef}
                tabIndex={0}
                className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-8 text-center outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  for (const item of Array.from(items)) {
                    if (item.type.startsWith('image/')) {
                      e.preventDefault();
                      const file = item.getAsFile();
                      if (file) readFile(file);
                      return;
                    }
                  }
                  const text = e.clipboardData?.getData('text');
                  if (text && /^https?:\/\//i.test(text.trim())) {
                    e.preventDefault();
                    setUrl(text.trim());
                    setPreview(text.trim());
                    setTab('url');
                  }
                }}
              >
                <ClipboardPaste className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                <p className="text-sm font-medium text-slate-800">Click here, then paste (⌘V / Ctrl+V)</p>
                <p className="mt-1 text-xs text-slate-500">
                  Works with screenshots and images copied from another app.
                </p>
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={async () => {
                    try {
                      setBusy(true);
                      setError(null);
                      const items = await navigator.clipboard.read();
                      for (const item of items) {
                        const type = item.types.find((t) => t.startsWith('image/'));
                        if (!type) continue;
                        const blob = await item.getType(type);
                        readFile(new File([blob], 'clipboard.png', { type }));
                        setBusy(false);
                        return;
                      }
                      setError('No image found on the clipboard.');
                    } catch {
                      setError('Clipboard access was blocked. Click the box and paste instead.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Read from clipboard
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}

          {preview && (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <p className="border-b border-slate-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Preview
              </p>
              <div className="flex max-h-56 items-center justify-center p-3">
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-48 max-w-full rounded object-contain"
                  onError={() => setError('Could not load that image. Check the URL or file.')}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={tab === 'url' ? !url.trim() : !preview}
            onClick={() => (tab === 'url' && !preview?.startsWith('data:') ? insertUrl() : insertPreview())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Insert
          </button>
        </div>
      </div>
    </div>
  );
};

function normalizeHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  return `https://${trimmed}`;
}

/** Polished Insert / Edit link panel (Docs-style). */
const InsertLinkModal: React.FC<{
  open: boolean;
  initialUrl: string;
  initialText: string;
  hasExistingLink: boolean;
  onClose: () => void;
  onApply: (url: string, text: string) => void;
  onRemove: () => void;
}> = ({ open, initialUrl, initialText, hasExistingLink, onClose, onApply, onRemove }) => {
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl);
    setText(initialText);
    setError(null);
  }, [open, initialUrl, initialText]);

  if (!open) return null;

  const apply = () => {
    const href = normalizeHref(url);
    if (!href) {
      setError('Enter a web address.');
      return;
    }
    onApply(href, text.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {hasExistingLink ? 'Edit link' : 'Insert link'}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Links open with {isMac ? '⌘' : 'Ctrl'} + click — regular click only selects the text.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Text
            </span>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="Display text"
              autoFocus={!initialText}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Link
            </span>
            <div className="relative">
              <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    apply();
                  }
                }}
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="https://example.com"
                autoFocus={!!initialText}
              />
            </div>
          </label>
          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}
          <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5 text-xs text-sky-900">
            <Type className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
            <span>
              Tip: select text first, then insert a link — or leave Text empty to use the URL as the label.
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          {hasExistingLink ? (
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
              onClick={() => {
                onRemove();
                onClose();
              }}
            >
              Remove link
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={apply}
            >
              <Check className="h-4 w-4" />
              {hasExistingLink ? 'Update' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const IMAGE_WIDTHS = [
  { label: 'S', value: '25%', title: 'Small' },
  { label: 'M', value: '50%', title: 'Medium' },
  { label: 'L', value: '75%', title: 'Large' },
  { label: 'Full', value: '100%', title: 'Full width' },
] as const;

const NotePdfViewerDialog: React.FC<{
  open: boolean;
  url: string | null;
  fileName: string;
  onClose: () => void;
}> = ({ open, url, fileName, onClose }) => (
  <Dialog
    open={open}
    onOpenChange={(next) => {
      if (!next) onClose();
    }}
  >
    <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
      <DialogHeader className="border-b border-slate-200 px-5 py-4 pr-12">
        <DialogTitle className="text-base">PDF preview</DialogTitle>
        <DialogDescription className="text-xs">
          Your document is ready. Download or print from here — no HTML page opens.
        </DialogDescription>
      </DialogHeader>
      {url ? (
        <iframe
          title="Document PDF"
          src={`${url}#toolbar=1&navpanes=0`}
          className="h-[min(78vh,720px)] w-full border-0 bg-slate-100"
        />
      ) : (
        <div className="flex h-48 items-center justify-center text-sm text-slate-500">Loading PDF…</div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white/80"
          onClick={onClose}
        >
          Close
        </button>
        {url ? (
          <a
            href={url}
            download={fileName}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white/80"
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </a>
        ) : null}
        {url ? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            onClick={() => {
              const win = window.open(url, '_blank', 'noopener,noreferrer');
              win?.focus();
            }}
          >
            <Printer className="h-3.5 w-3.5" />
            Open in new tab
          </button>
        ) : null}
      </div>
    </DialogContent>
  </Dialog>
);

const PrintPreviewPanel: React.FC<{
  open: boolean;
  onClose: () => void;
  editor: Editor;
  documentTitle?: string;
  onPdfReady: (payload: { url: string; fileName: string }) => void;
}> = ({ open, onClose, editor, documentTitle, onPdfReady }) => {
  const [mode, setMode] = useState<PrintDocumentMode>('full');
  const [previewTick, setPreviewTick] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    if (!open) return;
    const refresh = () => setPreviewTick((n) => n + 1);
    editor.on('transaction', refresh);
    return () => {
      editor.off('transaction', refresh);
    };
  }, [open, editor]);

  useEffect(() => {
    if (!open) {
      setExportError('');
      setExporting(false);
    }
  }, [open]);

  const docTitle = (documentTitle || '').trim() || 'Untitled document';
  const { bodyHtml, legend } = useMemo(() => {
    void previewTick;
    return normalizePrintBodyHtml(editor.getHTML(), mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- previewTick refreshes live doc
  }, [editor, mode, previewTick]);

  const handleExportPdf = async () => {
    setExporting(true);
    setExportError('');
    try {
      const { bodyHtml: exportBody, legend: exportLegend } = normalizePrintBodyHtml(
        editor.getHTML(),
        mode,
      );
      const blob = await generateNotePdfBlob({
        docTitle,
        bodyHtml: exportBody,
        mode,
        legend: exportLegend,
        logoUrl: conetLearnLogo.src,
      });
      const url = URL.createObjectURL(blob);
      onPdfReady({ url, fileName: sanitizePdfFileName(docTitle) });
      onClose();
    } catch {
      setExportError('Could not create PDF. Try again in a moment.');
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  const previewScale = 0.19;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        className="absolute left-0 top-full z-50 mt-1.5 w-[min(360px,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-200/80 ring-1 ring-slate-900/5"
        role="dialog"
        aria-label="Print preview"
      >
        <p className="text-xs font-semibold text-slate-900">Export as PDF</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Pick a layout — we generate a framed PDF with the Co-Net Learn header.
        </p>

        <fieldset className="mt-3 space-y-2 border-0 p-0">
          <legend className="sr-only">PDF version</legend>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-2.5 py-2 hover:bg-slate-50">
            <input
              type="radio"
              name="print-mode"
              className="mt-0.5"
              checked={mode === 'full'}
              onChange={() => setMode('full')}
              disabled={exporting}
            />
            <span className="min-w-0">
              <span className="block text-[11px] font-medium text-slate-900">Full document</span>
              <span className="block text-[10px] text-slate-500">Clean copy without author highlights</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-2.5 py-2 hover:bg-slate-50">
            <input
              type="radio"
              name="print-mode"
              className="mt-0.5"
              checked={mode === 'contributions'}
              onChange={() => setMode('contributions')}
              disabled={exporting}
            />
            <span className="min-w-0">
              <span className="block text-[11px] font-medium text-slate-900">With contributions</span>
              <span className="block text-[10px] text-slate-500">
                Each student&apos;s text highlighted in a different color
              </span>
            </span>
          </label>
        </fieldset>

        <div className="mt-3 rounded-lg border border-slate-200 bg-gradient-to-b from-slate-100 to-slate-200/80 p-2">
          <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Preview
          </p>
          <div
            className="mx-auto h-[180px] w-[118px] overflow-hidden rounded-md border border-slate-300/80 bg-slate-200 shadow-inner"
            aria-hidden
          >
            <div
              className="origin-top-left rounded-md bg-gradient-to-br from-slate-100 to-slate-200 p-2 text-slate-900"
              style={{
                width: NOTE_PDF_RENDER_WIDTH_PX,
                transform: `scale(${previewScale})`,
              }}
            >
              <div className="overflow-hidden rounded-lg border-2 border-slate-300 bg-white shadow-md">
                <div className="flex items-center gap-2 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-indigo-50/80 to-slate-50 px-3 py-2">
                  <NextImage
                    src={conetLearnLogo}
                    alt=""
                    className="h-7 w-auto object-contain"
                    priority
                  />
                  <div className="min-w-0">
                    <p className="text-[8px] font-semibold uppercase tracking-wider text-slate-500">
                      Co-Net Learn
                    </p>
                    <p className="truncate text-[11px] font-bold leading-tight text-slate-900">
                      {CONET_LEARN_TAGLINE}
                    </p>
                  </div>
                </div>
                <div
                  className="px-3 py-2"
                  style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '12pt', lineHeight: 1.5 }}
                >
                  <h1
                    className="border-b border-slate-200 pb-1 text-[14pt] font-bold"
                    style={{ margin: '0 0 8pt' }}
                  >
                    {docTitle}
                  </h1>
                  {mode === 'contributions' && legend.length > 0 ? (
                    <div className="mb-2 rounded border border-slate-200 bg-slate-50 p-1.5 text-[8pt]">
                      <div className="mb-1 font-semibold">Contributions</div>
                      <div className="flex flex-wrap gap-1">
                        {legend.slice(0, 4).map((item) => (
                          <span
                            key={item.authorId}
                            className="inline-flex items-center gap-0.5 rounded px-0.5"
                            style={{ background: item.highlightColor }}
                          >
                            {item.authorName}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {mode === 'contributions' && legend.length === 0 ? (
          <p className="mt-2 text-[10px] text-amber-700">
            No attributed contributions yet — PDF will match the full document.
          </p>
        ) : null}

        {exportError ? <p className="mt-2 text-[10px] text-red-600">{exportError}</p> : null}

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={onClose}
            disabled={exporting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            onClick={() => void handleExportPdf()}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Printer className="h-3.5 w-3.5" />
            )}
            {exporting ? 'Creating PDF…' : 'Create PDF'}
          </button>
        </div>
      </div>
    </>
  );
};

export const CollaborativeNoteToolbar: React.FC<{
  editor: Editor | null;
  documentTitle?: string;
  onAddComment?: () => void;
  /** Optional top meta row (title / presence / actions) — combined chrome. */
  meta?: React.ReactNode;
  /** When true, omit outer sticky wrapper (parent provides sticky chrome). */
  embedded?: boolean;
}> = ({ editor, documentTitle, onAddComment, meta, embedded = false }) => {
  const [, setTick] = useState(0);
  const [styleOpen, setStyleOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [showImage, setShowImage] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [pdfView, setPdfView] = useState<{ url: string; fileName: string } | null>(null);

  const closePdfView = useCallback(() => {
    setPdfView((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (pdfView?.url) URL.revokeObjectURL(pdfView.url);
    };
  }, [pdfView?.url]);

  useEffect(() => {
    if (!editor) return;
    const refresh = () => setTick((n) => n + 1);
    editor.on('selectionUpdate', refresh);
    editor.on('transaction', refresh);
    return () => {
      editor.off('selectionUpdate', refresh);
      editor.off('transaction', refresh);
    };
  }, [editor]);

  if (!editor) return null;

  const currentFont =
    (editor.getAttributes('textStyle').fontFamily as string | undefined) || 'Arial, sans-serif';
  const currentFontLabel =
    FONT_FAMILIES.find((f) => f.value === currentFont)?.name ||
    currentFont.split(',')[0].replace(/"/g, '') ||
    'Arial';
  const currentSizeRaw = (editor.getAttributes('textStyle').fontSize as string | undefined) || '';
  const currentSizeNum = parseInt(currentSizeRaw, 10) || 11;
  const styleLabel = editor.isActive('heading', { level: 1 })
    ? 'Title'
    : editor.isActive('heading', { level: 2 })
      ? 'Heading 1'
      : editor.isActive('heading', { level: 3 })
        ? 'Heading 2'
        : editor.isActive('heading', { level: 4 })
          ? 'Heading 3'
          : 'Normal text';

  const closeMenus = () => {
    setStyleOpen(false);
    setFontOpen(false);
    setSizeOpen(false);
    setColorOpen(false);
    setHighlightOpen(false);
    setAlignOpen(false);
    setPrintPreviewOpen(false);
  };

  const bumpSize = (delta: number) => {
    const next = Math.min(144, Math.max(6, currentSizeNum + delta));
    (editor.chain().focus() as any).setFontSize(`${next}px`).run();
  };

  return (
    <>
      <div
        className={
          embedded
            ? 'border-t border-slate-200/80 bg-white'
            : 'sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm'
        }
      >
        {meta}
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 sm:px-2.5">
        <div className="relative">
          <ToolbarButton
            title="Print"
            active={printPreviewOpen}
            onClick={() => {
              setStyleOpen(false);
              setFontOpen(false);
              setSizeOpen(false);
              setColorOpen(false);
              setHighlightOpen(false);
              setAlignOpen(false);
              setPrintPreviewOpen((open) => !open);
            }}
          >
            <Printer className="h-3.5 w-3.5" />
          </ToolbarButton>
          <PrintPreviewPanel
            open={printPreviewOpen}
            onClose={() => setPrintPreviewOpen(false)}
            editor={editor}
            documentTitle={documentTitle}
            onPdfReady={(payload) => {
              setPdfView((current) => {
                if (current?.url) URL.revokeObjectURL(current.url);
                return payload;
              });
            }}
          />
        </div>
        <Divider />

        {/* Styles */}
        <div className="relative">
          <button
            type="button"
            title="Styles"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              closeMenus();
              setStyleOpen((v) => !v);
            }}
            className="inline-flex h-7 min-w-[5.5rem] max-w-[7rem] items-center justify-between gap-0.5 rounded-md px-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
          >
            <span className="truncate">{styleLabel}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
          </button>
          <DropdownShell open={styleOpen} onClose={() => setStyleOpen(false)} className="w-40">
            {STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className="block w-full px-2.5 py-1 text-left text-[11px] text-slate-800 hover:bg-slate-100"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (opt.value === 'paragraph') {
                    editor.chain().focus().setParagraph().run();
                  } else {
                    editor.chain().focus().toggleHeading({ level: opt.level! }).run();
                  }
                  setStyleOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))}
          </DropdownShell>
        </div>

        {/* Font family */}
        <div className="relative">
          <button
            type="button"
            title="Font"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              closeMenus();
              setFontOpen((v) => !v);
            }}
            className="inline-flex h-7 min-w-[4.75rem] max-w-[6.5rem] items-center justify-between gap-0.5 rounded-md px-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
          >
            <span className="truncate" style={{ fontFamily: currentFont }}>
              {currentFontLabel}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
          </button>
          <DropdownShell open={fontOpen} onClose={() => setFontOpen(false)} className="w-44">
            {FONT_FAMILIES.map((f) => (
              <button
                key={f.value}
                type="button"
                className="block w-full px-2.5 py-1 text-left text-[11px] text-slate-800 hover:bg-slate-100"
                style={{ fontFamily: f.value }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().setFontFamily(f.value).run();
                  setFontOpen(false);
                }}
              >
                {f.name}
              </button>
            ))}
          </DropdownShell>
        </div>

        {/* Font size */}
        <div className="relative flex items-center rounded-md border border-slate-200 bg-slate-50/80">
          <button
            type="button"
            title="Decrease font size"
            className="inline-flex h-6 w-6 items-center justify-center rounded-l-md text-slate-600 hover:bg-slate-100"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => bumpSize(-1)}
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Font size"
            className="h-6 min-w-[1.75rem] px-0.5 text-center text-[11px] font-semibold text-slate-800 hover:bg-slate-100"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              closeMenus();
              setSizeOpen((v) => !v);
            }}
          >
            {currentSizeNum}
          </button>
          <button
            type="button"
            title="Increase font size"
            className="inline-flex h-6 w-6 items-center justify-center rounded-r-md text-slate-600 hover:bg-slate-100"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => bumpSize(1)}
          >
            <Plus className="h-3 w-3" />
          </button>
          <DropdownShell open={sizeOpen} onClose={() => setSizeOpen(false)} className="w-16">
            {FONT_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className="block w-full px-2 py-1 text-left text-[11px] text-slate-800 hover:bg-slate-100"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  (editor.chain().focus() as any).setFontSize(`${s}px`).run();
                  setSizeOpen(false);
                }}
              >
                {s}
              </button>
            ))}
          </DropdownShell>
        </div>

        <Divider />

        <ToolbarButton
          title="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="relative">
          <ToolbarButton
            title="Text color"
            active={colorOpen}
            onClick={() => {
              closeMenus();
              setColorOpen((v) => !v);
            }}
          >
            <span className="flex flex-col items-center leading-none">
              <Type className="h-3.5 w-3.5" />
              <span
                className="mt-0.5 h-0.5 w-3.5 rounded"
                style={{
                  backgroundColor:
                    (editor.getAttributes('textStyle').color as string) || '#000000',
                }}
              />
            </span>
          </ToolbarButton>
          <DropdownShell open={colorOpen} onClose={() => setColorOpen(false)} className="w-44 p-2">
            <div className="grid grid-cols-8 gap-1">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  className="h-5 w-5 rounded border border-slate-200"
                  style={{ backgroundColor: c }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().setColor(c).run();
                    setColorOpen(false);
                  }}
                />
              ))}
            </div>
          </DropdownShell>
        </div>

        <div className="relative">
          <ToolbarButton
            title="Highlight color"
            active={editor.isActive('highlight') || highlightOpen}
            onClick={() => {
              closeMenus();
              setHighlightOpen((v) => !v);
            }}
          >
            <Highlighter className="h-3.5 w-3.5" />
          </ToolbarButton>
          <DropdownShell open={highlightOpen} onClose={() => setHighlightOpen(false)} className="w-44 p-2">
            <div className="grid grid-cols-5 gap-1">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  className="h-5 w-5 rounded border border-slate-200"
                  style={{ backgroundColor: c }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (c === '#ffffff') {
                      editor.chain().focus().unsetHighlight().run();
                    } else {
                      editor.chain().focus().toggleHighlight({ color: c }).run();
                    }
                    setHighlightOpen(false);
                  }}
                />
              ))}
            </div>
          </DropdownShell>
        </div>

        <Divider />

        <ToolbarButton
          title="Insert link"
          active={editor.isActive('link')}
          onClick={() => {
            const { from, to } = editor.state.selection;
            const selected = editor.state.doc.textBetween(from, to, ' ');
            const href = (editor.getAttributes('link').href as string) || '';
            setLinkUrl(href);
            setLinkText(selected);
            setShowLink(true);
          }}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        {onAddComment && (
          <ToolbarButton title="Add comment" onClick={onAddComment}>
            <MessageSquare className="h-3.5 w-3.5" />
          </ToolbarButton>
        )}
        <ToolbarButton title="Insert image" onClick={() => setShowImage(true)}>
          <ImageIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        <Divider />

        <div className="relative">
          <ToolbarButton
            title="Align"
            active={alignOpen}
            onClick={() => {
              closeMenus();
              setAlignOpen((v) => !v);
            }}
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </ToolbarButton>
          <DropdownShell open={alignOpen} onClose={() => setAlignOpen(false)} className="flex w-auto gap-0.5 p-1">
            {[
              { align: 'left' as const, icon: <AlignLeft className="h-3.5 w-3.5" />, title: 'Left' },
              { align: 'center' as const, icon: <AlignCenter className="h-3.5 w-3.5" />, title: 'Center' },
              { align: 'right' as const, icon: <AlignRight className="h-3.5 w-3.5" />, title: 'Right' },
              { align: 'justify' as const, icon: <AlignJustify className="h-3.5 w-3.5" />, title: 'Justify' },
            ].map((a) => (
              <ToolbarButton
                key={a.align}
                title={a.title}
                active={editor.isActive({ textAlign: a.align })}
                onClick={() => {
                  editor.chain().focus().setTextAlign(a.align).run();
                  setAlignOpen(false);
                }}
              >
                {a.icon}
              </ToolbarButton>
            ))}
          </DropdownShell>
        </div>

        <ToolbarButton
          title="Bulleted list"
          active={editor.isActive('bulletList')}
          onClick={() => {
            editor.chain().focus().toggleBulletList().run();
          }}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => {
            editor.chain().focus().toggleOrderedList().run();
          }}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Decrease indent"
          disabled={!editor.can().liftListItem('listItem')}
          onClick={() => editor.chain().focus().liftListItem('listItem').run()}
        >
          <Outdent className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Increase indent"
          disabled={!editor.can().sinkListItem('listItem')}
          onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
        >
          <Indent className="h-3.5 w-3.5" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          title="Clear formatting"
          onClick={() =>
            editor.chain().focus().clearNodes().unsetAllMarks().run()
          }
        >
          <RemoveFormatting className="h-3.5 w-3.5" />
        </ToolbarButton>
        </div>
      </div>

      {editor.isActive('image') && (
        <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 bg-slate-50/80 px-2 py-1">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Image
          </span>
          {IMAGE_WIDTHS.map((w) => (
            <button
              key={w.value}
              type="button"
              title={w.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                editor.chain().focus().updateAttributes('image', { width: w.value }).run()
              }
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                (editor.getAttributes('image').width || '75%') === w.value
                  ? 'bg-sky-100 text-sky-900'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {w.label}
            </button>
          ))}
          <div className="mx-1 h-3.5 w-px bg-slate-200" />
          {(
            [
              { align: 'left' as const, icon: <AlignLeft className="h-3 w-3" />, title: 'Align left' },
              { align: 'center' as const, icon: <AlignCenter className="h-3 w-3" />, title: 'Align center' },
              { align: 'right' as const, icon: <AlignRight className="h-3 w-3" />, title: 'Align right' },
            ] as const
          ).map((a) => (
            <button
              key={a.align}
              type="button"
              title={a.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                editor.chain().focus().updateAttributes('image', { align: a.align }).run()
              }
              className={`inline-flex h-6 w-6 items-center justify-center rounded transition ${
                (editor.getAttributes('image').align || 'center') === a.align
                  ? 'bg-sky-100 text-sky-900'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {a.icon}
            </button>
          ))}
        </div>
      )}

      <InsertLinkModal
        open={showLink}
        initialUrl={linkUrl}
        initialText={linkText}
        hasExistingLink={editor.isActive('link') || !!linkUrl}
        onClose={() => setShowLink(false)}
        onRemove={() => {
          editor.chain().focus().extendMarkRange('link').unsetLink().run();
        }}
        onApply={(href, displayText) => {
          const { from, to, empty } = editor.state.selection;
          const selected = editor.state.doc.textBetween(from, to, ' ');
          if (empty) {
            const label = displayText || href;
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'text',
                text: label,
                marks: [{ type: 'link', attrs: { href } }],
              })
              .run();
            return;
          }
          if (displayText && displayText !== selected) {
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'text',
                text: displayText,
                marks: [{ type: 'link', attrs: { href } }],
              })
              .run();
            return;
          }
          editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
        }}
      />

      <InsertImageModal
        open={showImage}
        onClose={() => setShowImage(false)}
        onInsert={(src) => {
          editor.chain().focus().setImage({ src }).run();
        }}
      />

      <NotePdfViewerDialog
        open={Boolean(pdfView)}
        url={pdfView?.url ?? null}
        fileName={pdfView?.fileName ?? 'document.pdf'}
        onClose={closePdfView}
      />
    </>
  );
};

export const CollaborativeNoteEditor: React.FC<CollaborativeNoteEditorProps> = ({
  ydoc,
  fragment: fragmentProp,
  awareness,
  user,
  editable = true,
  placeholder = 'Start writing…',
  className = '',
  seedHtml,
  onSeedConsumed,
  onEditorReady,
  onAddCommentRequest,
  documentTitle,
  showToolbar = true,
  minHeight = '360px',
  publishPresence = true,
}) => {
  const seededRef = useRef(false);
  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;
  const editorRef = useRef<Editor | null>(null);
  const fragment = fragmentProp || ydoc.getXmlFragment('prosemirror');

  const awarenessUser = useMemo(
    () =>
      buildCollaborationAwarenessUser({
        userId: user.userId,
        name: user.name,
        color: user.color,
        figureIndex: user.figureIndex,
      }),
    [user.userId, user.name, user.color, user.figureIndex],
  );

  const authorStampExtension = useMemo(
    () =>
      Extension.create({
        name: 'conetAuthorStamp',
        addProseMirrorPlugins() {
          return [createAuthorStampPlugin(user.userId, user.name)];
        },
      }),
    [user.userId, user.name],
  );

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        history: false,
        heading: { levels: [1, 2, 3, 4] },
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
          HTMLAttributes: { class: 'note-bullet-list' },
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
          HTMLAttributes: { class: 'note-ordered-list' },
        },
        listItem: {
          HTMLAttributes: { class: 'note-list-item' },
        },
      }),
      Underline,
      TextStyle,
      FontSize,
      FontFamily,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: 'note-link',
          rel: 'noopener noreferrer nofollow',
        },
      }),
      ResizableImage.configure({ allowBase64: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      CommentMark,
      ConetAuthorMark,
      authorStampExtension,
      Placeholder.configure({ placeholder }),
      Collaboration.configure({
        document: ydoc,
        field: 'prosemirror',
      }),
      ...(publishPresence
        ? [
            CollaborationCursor.configure({
              provider: { awareness } as any,
              user: awarenessUser,
              render: renderCollaborationCursor,
            }),
          ]
        : []),
    ],
    [ydoc, awareness, awarenessUser, placeholder, publishPresence, authorStampExtension]
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      editable,
      editorProps: {
        attributes: {
          class:
            'prose prose-slate max-w-none focus:outline-none px-8 py-6 min-h-full text-slate-900',
          style: `min-height: ${minHeight}`,
        },
        handleClick: (_view, _pos, event) => {
          const target = event.target as HTMLElement | null;
          const anchor = target?.closest?.('a') as HTMLAnchorElement | null;
          if (!anchor) return false;
          // Docs-style: only open with Ctrl/Cmd + click
          event.preventDefault();
          if (event.metaKey || event.ctrlKey) {
            const href = anchor.getAttribute('href');
            if (href) window.open(href, '_blank', 'noopener,noreferrer');
          }
          return true;
        },
        handlePaste: (_view, event) => {
          const ed = editorRef.current;
          const items = event.clipboardData?.items;
          if (!items || !ed) return false;
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              const file = item.getAsFile();
              if (!file) continue;
              const reader = new FileReader();
              reader.onload = () => {
                const src = String(reader.result || '');
                if (src) ed.chain().focus().setImage({ src }).run();
              };
              reader.readAsDataURL(file);
              return true;
            }
          }
          return false;
        },
      },
    },
    [ydoc]
  );

  useEffect(() => {
    editorRef.current = editor;
    if (editor) onEditorReadyRef.current?.(editor);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor || !publishPresence) return;
    editor.commands.updateUser(awarenessUser);
  }, [editor, awarenessUser, publishPresence]);

  useEffect(() => {
    if (!editor || seededRef.current || !seedHtml) return;
    const isEmpty = editor.isEmpty || editor.getText().trim() === '';
    if (!isEmpty || fragment.length > 0) {
      seededRef.current = true;
      onSeedConsumed?.();
      return;
    }
    const html = seedHtml.includes('<')
      ? seedHtml
      : `<p>${seedHtml.replace(/\n/g, '</p><p>')}</p>`;
    editor.commands.setContent(html, false);
    seededRef.current = true;
    onSeedConsumed?.();
  }, [editor, seedHtml, fragment, onSeedConsumed]);

  if (!editor) {
    return (
      <div className={`flex items-center justify-center bg-white ${className}`} style={{ minHeight }}>
        <p className="text-sm text-slate-500">Connecting collaborative editor…</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white ${className}`}>
      {showToolbar && (
        <CollaborativeNoteToolbar
          editor={editor}
          documentTitle={documentTitle}
          onAddComment={onAddCommentRequest}
        />
      )}
      <div className="flex-1 overflow-auto" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
      <style>{`
        .collaboration-cursor__caret {
          border-left: 2px solid;
          border-right: none;
          margin-left: -1px;
          margin-right: -1px;
          pointer-events: none;
          position: relative;
          word-break: normal;
        }
        .collaboration-cursor__label {
          align-items: center;
          background: #171717;
          border: 2px solid #fff;
          border-radius: 9999px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
          color: #fff;
          display: inline-flex;
          font-size: 10px;
          font-style: normal;
          font-weight: 600;
          gap: 4px;
          left: -1px;
          line-height: 1;
          max-width: 12rem;
          padding: 2px 6px 2px 2px;
          position: absolute;
          top: -1.65em;
          user-select: none;
          white-space: nowrap;
        }
        .collaboration-cursor__avatar {
          border-radius: 9999px;
          flex-shrink: 0;
          height: 16px;
          object-fit: cover;
          width: 16px;
        }
        .collaboration-cursor__name {
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          color: #94a3b8;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .ProseMirror ul.note-bullet-list,
        .ProseMirror ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .ProseMirror ol.note-ordered-list,
        .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .ProseMirror li.note-list-item,
        .ProseMirror li {
          margin: 0.15rem 0;
        }
        .ProseMirror li p {
          margin: 0;
        }
        .ProseMirror a.note-link {
          color: #1a73e8;
          text-decoration: underline;
          cursor: text;
        }
        .ProseMirror a.note-link:hover {
          color: #174ea6;
        }
        .ProseMirror img.note-img {
          display: block;
          max-width: 100%;
          height: auto;
          border-radius: 0.25rem;
        }
        .ProseMirror img.note-img-left {
          margin-left: 0;
          margin-right: auto;
        }
        .ProseMirror img.note-img-center {
          margin-left: auto;
          margin-right: auto;
        }
        .ProseMirror img.note-img-right {
          margin-left: auto;
          margin-right: 0;
        }
        .ProseMirror img.ProseMirror-selectednode {
          outline: 2px solid #1a73e8;
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
};

export function applyCommentMark(editor: Editor, commentId: string): boolean {
  if (editor.state.selection.empty) return false;
  return editor.chain().focus().setMark('comment', { commentId }).run();
}

export function getSelectedQuote(editor: Editor): string {
  const { from, to } = editor.state.selection;
  return editor.state.doc.textBetween(from, to, ' ');
}
