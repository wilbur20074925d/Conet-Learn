/**
 * Structured Yjs schema for Collaborative Documentation (Google Docs-style).
 *
 * Y.Doc
 *   meta: Y.Map
 *     docTitle: string          ← LWW title (do NOT use Y.Text — concurrent
 *                                  delete+insert duplicates under CRDT merge)
 *     initialized, seedHtml, lastHtml
 *   prosemirror: Y.XmlFragment  ← TipTap Collaboration binds this
 *   comments: Y.Array<Y.Map>
 */

import * as Y from 'yjs';

export const TITLE_KEY = 'title'; // legacy Y.Text — read-only fallback
export const DOC_TITLE_META_KEY = 'docTitle';
export const FRAGMENT_KEY = 'prosemirror';
export const COMMENTS_KEY = 'comments';
export const META_KEY = 'meta';

export const NOTE_STORAGE_HEADER = '__NOTE_V1__';
export const YJS_UPDATE_HEADER = '__YJS_UPDATE__';

export interface NoteCommentCollab {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  status: 'active' | 'resolved' | 'agreed' | 'edited';
  quote?: string;
}

export function colorForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 45%)`;
}

/** Collapse accidental CRDT title duplication: "FooFooFoo" → "Foo". */
export function collapseRepeatedTitle(title: string): string {
  const raw = (title || '').trim();
  if (raw.length < 2) return raw;
  for (let len = 1; len <= Math.floor(raw.length / 2); len++) {
    if (raw.length % len !== 0) continue;
    const unit = raw.slice(0, len);
    if (unit.repeat(raw.length / len) === raw) return unit;
  }
  return raw;
}

export function getTitleText(doc: Y.Doc): Y.Text {
  return doc.getText(TITLE_KEY);
}

export function getProseFragment(doc: Y.Doc): Y.XmlFragment {
  return doc.getXmlFragment(FRAGMENT_KEY);
}

export function getCommentsArray(doc: Y.Doc): Y.Array<Y.Map<any>> {
  return doc.getArray(COMMENTS_KEY);
}

export function getMetaMap(doc: Y.Doc): Y.Map<any> {
  return doc.getMap(META_KEY);
}

export function readTitle(doc: Y.Doc): string {
  const meta = getMetaMap(doc);
  const fromMeta = meta.get(DOC_TITLE_META_KEY);
  if (typeof fromMeta === 'string' && fromMeta.length > 0) {
    return collapseRepeatedTitle(fromMeta);
  }
  // Legacy Y.Text path — collapse duplicates from concurrent rewrite races
  return collapseRepeatedTitle(getTitleText(doc).toString());
}

export function setTitle(doc: Y.Doc, title: string): void {
  const next = collapseRepeatedTitle(title);
  const meta = getMetaMap(doc);
  const current = readTitle(doc);
  if (current === next) return;

  doc.transact(() => {
    meta.set(DOC_TITLE_META_KEY, next);
    // Clear legacy Y.Text so it cannot keep growing via concurrent merges
    const ytitle = getTitleText(doc);
    if (ytitle.length > 0) {
      ytitle.delete(0, ytitle.length);
    }
  });
}

export function commentsToArray(doc: Y.Doc): NoteCommentCollab[] {
  return getCommentsArray(doc)
    .toArray()
    .map((m) => ({
      id: String(m.get('id') || ''),
      authorId: String(m.get('authorId') || ''),
      authorName: String(m.get('authorName') || ''),
      text: String(m.get('text') || ''),
      createdAt: String(m.get('createdAt') || new Date().toISOString()),
      status: (m.get('status') as NoteCommentCollab['status']) || 'active',
      quote: m.get('quote') ? String(m.get('quote')) : undefined,
    }))
    .filter((c) => c.id);
}

export function addCommentToDoc(
  doc: Y.Doc,
  comment: Omit<NoteCommentCollab, 'createdAt' | 'status'> & {
    createdAt?: string;
    status?: NoteCommentCollab['status'];
  }
): void {
  const ymap = new Y.Map();
  ymap.set('id', comment.id);
  ymap.set('authorId', comment.authorId);
  ymap.set('authorName', comment.authorName);
  ymap.set('text', comment.text);
  ymap.set('createdAt', comment.createdAt || new Date().toISOString());
  ymap.set('status', comment.status || 'active');
  if (comment.quote) ymap.set('quote', comment.quote);
  getCommentsArray(doc).push([ymap]);
}

export function updateCommentStatusInDoc(
  doc: Y.Doc,
  commentId: string,
  status: NoteCommentCollab['status']
): void {
  const arr = getCommentsArray(doc);
  for (let i = 0; i < arr.length; i++) {
    const m = arr.get(i);
    if (m.get('id') === commentId) {
      m.set('status', status);
      break;
    }
  }
}

/** Seed title + empty fragment from legacy HTML/plain content if doc is empty. */
export function seedNoteDocIfEmpty(
  doc: Y.Doc,
  seed: { title?: string; htmlOrText?: string }
): void {
  const meta = getMetaMap(doc);
  if (meta.get('initialized')) return;

  const fragment = getProseFragment(doc);

  doc.transact(() => {
    const existing = readTitle(doc);
    if (!existing && seed.title) {
      meta.set(DOC_TITLE_META_KEY, collapseRepeatedTitle(seed.title));
    } else if (existing) {
      meta.set(DOC_TITLE_META_KEY, existing);
      const ytitle = getTitleText(doc);
      if (ytitle.length > 0) ytitle.delete(0, ytitle.length);
    }
    if (!meta.get('seedHtml') && seed.htmlOrText) {
      meta.set('seedHtml', seed.htmlOrText);
    }
    meta.set('initialized', true);
  });

  void fragment;
}

/**
 * One-shot repair for rooms that already duplicated titles via Y.Text races.
 * Safe to call on every connect — no-ops when already clean.
 */
export function repairDuplicatedTitle(doc: Y.Doc): void {
  const meta = getMetaMap(doc);
  const rawMeta =
    typeof meta.get(DOC_TITLE_META_KEY) === 'string'
      ? String(meta.get(DOC_TITLE_META_KEY))
      : '';
  const rawLegacy = getTitleText(doc).toString();
  const source = rawMeta || rawLegacy;
  if (!source) return;
  const fixed = collapseRepeatedTitle(source);
  if (fixed === rawMeta && rawLegacy.length === 0) return;
  doc.transact(() => {
    meta.set(DOC_TITLE_META_KEY, fixed);
    const ytitle = getTitleText(doc);
    if (ytitle.length > 0) ytitle.delete(0, ytitle.length);
  });
}

export function getSeedHtml(doc: Y.Doc): string {
  return String(getMetaMap(doc).get('seedHtml') || '');
}

export function clearSeedHtml(doc: Y.Doc): void {
  getMetaMap(doc).delete('seedHtml');
}

/**
 * Serialize note doc for Supabase storage.
 * Format:
 *   __NOTE_V1__
 *   {"title":"...","html":"..."}
 *   __YJS_UPDATE__
 *   <base64>
 */
export function serializeNoteDocForStorage(doc: Y.Doc, html: string): string {
  const payload = JSON.stringify({
    version: 1,
    title: readTitle(doc),
    html: html || '',
  });
  const update = Y.encodeStateAsUpdate(doc);
  const b64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(update).toString('base64')
      : btoa(String.fromCharCode(...Array.from(update)));
  return `${NOTE_STORAGE_HEADER}\n${payload}\n${YJS_UPDATE_HEADER}\n${b64}`;
}

export function parseStoredNote(stored: string | null | undefined): {
  title?: string;
  html: string;
  yjsUpdate: Uint8Array | null;
} {
  if (!stored) return { html: '', yjsUpdate: null };

  let yjsUpdate: Uint8Array | null = null;
  let body = stored;
  const updateIdx = stored.indexOf(YJS_UPDATE_HEADER);
  if (updateIdx >= 0) {
    body = stored.slice(0, updateIdx).trimEnd();
    const b64 = stored.slice(updateIdx + YJS_UPDATE_HEADER.length).trim();
    if (b64) {
      try {
        if (typeof Buffer !== 'undefined') {
          yjsUpdate = new Uint8Array(Buffer.from(b64, 'base64'));
        } else {
          const bin = atob(b64);
          yjsUpdate = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) yjsUpdate[i] = bin.charCodeAt(i);
        }
      } catch {
        yjsUpdate = null;
      }
    }
  }

  if (body.startsWith(NOTE_STORAGE_HEADER)) {
    try {
      const parsed = JSON.parse(body.slice(NOTE_STORAGE_HEADER.length).trim());
      return {
        title:
          typeof parsed?.title === 'string'
            ? collapseRepeatedTitle(parsed.title)
            : undefined,
        html: typeof parsed?.html === 'string' ? parsed.html : '',
        yjsUpdate,
      };
    } catch {
      return { html: '', yjsUpdate };
    }
  }

  return { html: body, yjsUpdate };
}

/** Plain-text preview from stored content (list cards). */
export function previewFromStoredContent(
  stored: string | null | undefined,
  maxLen = 160
): string {
  const { html } = parseStoredNote(stored);
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}
