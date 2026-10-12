/**
 * Yjs WebSocket server using the official y-websocket / y-protocols binary protocol.
 * Persists structured notebooks (cells + outputs) to Supabase.
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 1234;
const HOST = process.env.HOST || '0.0.0.0';
const pingTimeout = 30000;

const messageSync = 0;
const messageAwareness = 1;
const messageAuth = 2;
const messageQueryAwareness = 3;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  console.log('[Yjs Server] Supabase connected for persistence');
} else {
  console.warn('[Yjs Server] Supabase not configured — documents stay in memory');
}

const docs = new Map();
const loadingDocs = new Map();

const NOTEBOOK_V2_HEADER = '__NOTEBOOK_V2__';
const NOTEBOOK_V1_HEADER = '__NOTEBOOK_CELLS__';
const NOTE_V1_HEADER = '__NOTE_V1__';
const YJS_UPDATE_HEADER = '__YJS_UPDATE__';

/** Co-net Learn collaborative documentation table (StreamLearn used collaborative_notes). */
const NOTES_TABLE = process.env.YJS_NOTES_TABLE || 'ConetCollaborativeNotes';
const PROJECTS_TABLE = process.env.YJS_PROJECTS_TABLE || 'collaborative_projects';

function newCellId(i = 0) {
  return `cell_v1_${i}`;
}

function parseV1Cells(code) {
  const lines = code.split('\n');
  const parsedCells = [];
  let currentCellType = 'code';
  let currentCellContent = [];
  let started = false;

  const flush = () => {
    parsedCells.push({
      id: `cell_v1_${parsedCells.length}`,
      type: currentCellType,
      content: currentCellContent.join('\n'),
      language: currentCellType === 'code' ? 'python' : '',
    });
    currentCellContent = [];
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('[code]') || line.startsWith('[markdown]')) {
      if (started) flush();
      started = true;
      currentCellType = line.startsWith('[code]') ? 'code' : 'markdown';
      const contentAfterMarker = line.substring(line.indexOf(']') + 1);
      currentCellContent = contentAfterMarker ? [contentAfterMarker] : [];
    } else if (!started && line.trim() === '') {
      continue;
    } else {
      started = true;
      currentCellContent.push(line);
    }
  }
  if (started) flush();
  return parsedCells;
}

function parseStoredNotebook(stored) {
  if (!stored) return { cells: [] };
  let yjsUpdate = null;
  let body = stored;
  const updateIdx = stored.indexOf(YJS_UPDATE_HEADER);
  if (updateIdx >= 0) {
    body = stored.slice(0, updateIdx).trimEnd();
    const b64 = stored.slice(updateIdx + YJS_UPDATE_HEADER.length).trim();
    if (b64) {
      try {
        yjsUpdate = Buffer.from(b64, 'base64');
      } catch {
        yjsUpdate = null;
      }
    }
  }
  if (body.startsWith(NOTEBOOK_V2_HEADER)) {
    try {
      const parsed = JSON.parse(body.slice(NOTEBOOK_V2_HEADER.length).trim());
      return { cells: Array.isArray(parsed?.cells) ? parsed.cells : [], yjsUpdate };
    } catch {
      return { cells: [], yjsUpdate };
    }
  }
  if (body.startsWith(NOTEBOOK_V1_HEADER)) {
    return { cells: parseV1Cells(body), yjsUpdate };
  }
  return {
    cells: [{ id: newCellId(0), type: 'code', content: body, language: 'python' }],
    yjsUpdate,
  };
}

function yArrayToCells(ycells) {
  return ycells.toArray().map((ymap) => {
    const source = ymap.get('source');
    const images = ymap.get('outputImages');
    return {
      id: ymap.get('id'),
      type: ymap.get('type') === 'markdown' ? 'markdown' : 'code',
      content: source instanceof Y.Text ? source.toString() : '',
      language: ymap.get('language') || '',
      output: ymap.get('output') || '',
      error: ymap.get('error') || '',
      outputImages: images instanceof Y.Array ? images.toArray() : [],
      executionTime: ymap.get('executionTime') || 0,
      executedBy: ymap.get('executedBy') || '',
    };
  });
}

function isEphemeralCells(cells) {
  if (!cells || cells.length === 0) return true;
  return cells.every((cell) => {
    const text = String(cell.content || '').trim();
    return !text || text === '# Loading...' || text === '# Loading';
  });
}

function populateDocFromCells(doc, cells) {
  if (isEphemeralCells(cells)) return;
  const ycells = doc.getArray('cells');
  const meta = doc.getMap('meta');
  if (meta.get('initialized') && ycells.length > 0) return;
  if (ycells.length > 0) {
    meta.set('initialized', true);
    return;
  }
  doc.transact(() => {
    cells.forEach((cell, i) => {
      const ymap = new Y.Map();
      ycells.insert(i, [ymap]);
      ymap.set('id', cell.id || `cell_v1_${i}`);
      ymap.set('type', cell.type === 'markdown' ? 'markdown' : 'code');
      const ytext = new Y.Text();
      if (cell.content) ytext.insert(0, cell.content);
      ymap.set('source', ytext);
      ymap.set('language', cell.language || (cell.type === 'markdown' ? '' : 'python'));
      ymap.set('output', cell.output || '');
      ymap.set('error', cell.error || '');
      const yimages = new Y.Array();
      if (Array.isArray(cell.outputImages) && cell.outputImages.length) {
        yimages.insert(0, cell.outputImages);
      }
      ymap.set('outputImages', yimages);
      ymap.set('isExecuting', false);
      ymap.set('executionTime', cell.executionTime || 0);
      ymap.set('executedBy', cell.executedBy || '');
    });
    meta.set('initialized', true);
  });
}

function serializeDocForStorage(doc) {
  const json = `${NOTEBOOK_V2_HEADER}\n${JSON.stringify({ version: 2, cells: yArrayToCells(doc.getArray('cells')) })}`;
  const update = Y.encodeStateAsUpdate(doc);
  const b64 = Buffer.from(update).toString('base64');
  return `${json}\n${YJS_UPDATE_HEADER}\n${b64}`;
}

function parseStoredNote(stored) {
  if (!stored) return { title: '', html: '', yjsUpdate: null };
  let yjsUpdate = null;
  let body = stored;
  const updateIdx = stored.indexOf(YJS_UPDATE_HEADER);
  if (updateIdx >= 0) {
    body = stored.slice(0, updateIdx).trimEnd();
    const b64 = stored.slice(updateIdx + YJS_UPDATE_HEADER.length).trim();
    if (b64) {
      try {
        yjsUpdate = Buffer.from(b64, 'base64');
      } catch {
        yjsUpdate = null;
      }
    }
  }
  if (body.startsWith(NOTE_V1_HEADER)) {
    try {
      const parsed = JSON.parse(body.slice(NOTE_V1_HEADER.length).trim());
      return {
        title: typeof parsed?.title === 'string' ? parsed.title : '',
        html: typeof parsed?.html === 'string' ? parsed.html : '',
        yjsUpdate,
      };
    } catch {
      return { title: '', html: '', yjsUpdate };
    }
  }
  return { title: '', html: body, yjsUpdate };
}

function serializeNoteDocForStorage(doc) {
  const meta = doc.getMap('meta');
  const title =
    (typeof meta.get('docTitle') === 'string' && meta.get('docTitle')) ||
    doc.getText('title').toString() ||
    '';
  const html =
    (typeof meta.get('lastHtml') === 'string' && meta.get('lastHtml')) ||
    (typeof meta.get('seedHtml') === 'string' && meta.get('seedHtml')) ||
    '';
  const payload = JSON.stringify({ version: 1, title, html });
  const update = Y.encodeStateAsUpdate(doc);
  const b64 = Buffer.from(update).toString('base64');
  return `${NOTE_V1_HEADER}\n${payload}\n${YJS_UPDATE_HEADER}\n${b64}`;
}

function applyStoredNoteToDoc(doc, stored) {
  const parsed = parseStoredNote(stored);
  if (parsed.yjsUpdate && parsed.yjsUpdate.length > 0) {
    try {
      Y.applyUpdate(doc, parsed.yjsUpdate);
      doc.getMap('meta').set('initialized', true);
      return;
    } catch (e) {
      console.warn('[Yjs Server] Failed to apply stored note Yjs update', e);
    }
  }
  const meta = doc.getMap('meta');
  if (meta.get('initialized')) return;
  doc.transact(() => {
    if (parsed.title) meta.set('docTitle', parsed.title);
    if (parsed.html) meta.set('seedHtml', parsed.html);
    meta.set('initialized', true);
  });
}

function applyStoredToDoc(doc, stored) {
  if (doc.name.startsWith('note-')) {
    applyStoredNoteToDoc(doc, stored);
    return;
  }
  const parsed = parseStoredNotebook(stored);
  if (parsed.yjsUpdate && parsed.yjsUpdate.length > 0) {
    try {
      Y.applyUpdate(doc, parsed.yjsUpdate);
      const applied = yArrayToCells(doc.getArray('cells'));
      if (applied.length > 0 && !isEphemeralCells(applied)) {
        doc.getMap('meta').set('initialized', true);
        return;
      }
    } catch (e) {
      console.warn('[Yjs Server] Failed to apply stored Yjs update, falling back to JSON', e);
    }
  }
  if (parsed.cells.length > 0 && !isEphemeralCells(parsed.cells)) {
    const ycells = doc.getArray('cells');
    if (ycells.length > 0 && isEphemeralCells(yArrayToCells(ycells))) {
      doc.transact(() => ycells.delete(0, ycells.length));
      doc.getMap('meta').set('initialized', false);
    }
    populateDocFromCells(doc, parsed.cells);
  }
}

async function loadDocumentFromSupabase(roomId) {
  if (!supabase) return null;
  try {
    const isProject = roomId.startsWith('project-');
    const isNote = roomId.startsWith('note-');
    if (isProject) {
      const projectId = roomId.replace('project-', '');
      const { data, error } = await supabase
        .from(PROJECTS_TABLE)
        .select('code')
        .eq('id', projectId)
        .single();
      if (error || !data) return null;
      return data.code || '';
    }
    if (isNote) {
      const noteId = roomId.replace('note-', '');
      const { data, error } = await supabase
        .from(NOTES_TABLE)
        .select('content')
        .eq('id', noteId)
        .single();
      if (error || !data) return null;
      return data.content || '';
    }
  } catch (error) {
    console.error(`[Yjs Server] Error loading document for room ${roomId}:`, error);
  }
  return null;
}

async function saveDocumentToSupabase(roomId, content, userId, extra = {}) {
  if (!supabase) return;
  try {
    if (roomId.startsWith('project-')) {
      const projectId = roomId.replace('project-', '');
      const { error } = await supabase
        .from(PROJECTS_TABLE)
        .update({
          code: content,
          updated_at: new Date().toISOString(),
          last_edited_by: userId || null,
        })
        .eq('id', projectId);
      if (error) console.error(`[Yjs Server] Error saving project ${projectId}:`, error);
    } else if (roomId.startsWith('note-')) {
      const noteId = roomId.replace('note-', '');
      const patch = {
        content,
        updated_at: new Date().toISOString(),
        last_edited_by: userId || null,
      };
      if (typeof extra.title === 'string' && extra.title.trim()) {
        patch.title = extra.title.trim();
      }
      const { error } = await supabase.from(NOTES_TABLE).update(patch).eq('id', noteId);
      if (error) console.error(`[Yjs Server] Error saving note ${noteId}:`, error);
    }
  } catch (error) {
    console.error(`[Yjs Server] Error saving document for room ${roomId}:`, error);
  }
}

function noteIsEmpty(doc) {
  const meta = doc.getMap('meta');
  const title =
    (typeof meta.get('docTitle') === 'string' && meta.get('docTitle')) ||
    doc.getText('title').toString() ||
    '';
  const html =
    (typeof meta.get('lastHtml') === 'string' && meta.get('lastHtml')) ||
    (typeof meta.get('seedHtml') === 'string' && meta.get('seedHtml')) ||
    '';
  const fragment = doc.getXmlFragment('prosemirror');
  const hasFragment = fragment && fragment.length > 0;
  return !title.trim() && !String(html).replace(/<[^>]+>/g, '').trim() && !hasFragment;
}

const saveDebouncers = new Map();
function debouncedSave(doc, userId) {
  const roomId = doc.name;
  if (saveDebouncers.has(roomId)) clearTimeout(saveDebouncers.get(roomId));
  const timeout = setTimeout(() => {
    if (roomId.startsWith('chat-')) {
      saveDebouncers.delete(roomId);
      return;
    }
    if (roomId.startsWith('note-')) {
      if (noteIsEmpty(doc)) {
        console.log(`[Yjs Server] Skip persist empty note for ${roomId}`);
        saveDebouncers.delete(roomId);
        return;
      }
      const meta = doc.getMap('meta');
      const title =
        (typeof meta.get('docTitle') === 'string' && meta.get('docTitle')) ||
        doc.getText('title').toString() ||
        '';
      saveDocumentToSupabase(roomId, serializeNoteDocForStorage(doc), userId, { title });
      saveDebouncers.delete(roomId);
      return;
    }

    const cells = yArrayToCells(doc.getArray('cells'));
    if (isEphemeralCells(cells)) {
      console.log(`[Yjs Server] Skip persist empty/placeholder notebook for ${roomId}`);
      saveDebouncers.delete(roomId);
      return;
    }
    saveDocumentToSupabase(roomId, serializeDocForStorage(doc), userId);
    saveDebouncers.delete(roomId);
  }, 2000);
  saveDebouncers.set(roomId, timeout);
}

class WSSharedDoc extends Y.Doc {
  constructor(name) {
    super({ gc: true });
    this.name = name;
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    this.awareness.on('update', ({ added, updated, removed }, conn) => {
      const changedClients = added.concat(updated, removed);
      if (conn !== null) {
        const connControlledIDs = this.conns.get(conn);
        if (connControlledIDs !== undefined) {
          added.forEach((clientID) => connControlledIDs.add(clientID));
          removed.forEach((clientID) => connControlledIDs.delete(clientID));
        }
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => send(this, c, buff));
    });

    this.on('update', (update) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      this.conns.forEach((_, conn) => send(this, conn, message));
    });
  }
}

function send(doc, conn, message) {
  if (conn.readyState !== conn.OPEN) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(message, (err) => {
      if (err) closeConn(doc, conn);
    });
  } catch {
    closeConn(doc, conn);
  }
}

function closeConn(doc, conn) {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
  }
  conn.close();
}

function messageListener(conn, doc, message, userId) {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case messageSync: {
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        debouncedSave(doc, userId);
        break;
      }
      case messageAwareness: {
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn
        );
        break;
      }
      case messageQueryAwareness: {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, messageAwareness);
        encoding.writeVarUint8Array(
          enc,
          awarenessProtocol.encodeAwarenessUpdate(
            doc.awareness,
            Array.from(doc.awareness.getStates().keys())
          )
        );
        send(doc, conn, encoding.toUint8Array(enc));
        break;
      }
      case messageAuth:
        break;
      default:
        break;
    }
  } catch (err) {
    console.error('[Yjs Server] Error handling message:', err);
    doc.emit('error', [err]);
  }
}

async function getYDoc(roomId) {
  if (docs.has(roomId)) return docs.get(roomId);
  if (loadingDocs.has(roomId)) return loadingDocs.get(roomId);

  const promise = (async () => {
    const doc = new WSSharedDoc(roomId);
    const stored = await loadDocumentFromSupabase(roomId);
    if (stored) applyStoredToDoc(doc, stored);
    docs.set(roomId, doc);
    loadingDocs.delete(roomId);
    return doc;
  })();

  loadingDocs.set(roomId, promise);
  return promise;
}

function roomFromRequest(req) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, `http://${host}`);
  const fromQuery = url.searchParams.get('room');
  if (fromQuery) return fromQuery;
  const path = url.pathname.replace(/^\//, '');
  return path || 'default';
}

const httpServer = createServer((req, res) => {
  const url = req.url || '/';
  if (url.startsWith('/health') || url === '/' || url.startsWith('/?')) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('ok');
});

const wss = new WebSocketServer({ server: httpServer });

httpServer.listen(PORT, HOST, () => {
  console.log(`[Yjs Server] Listening on http://${HOST}:${PORT} (y-websocket protocol)`);
});

wss.on('connection', async (conn, req) => {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, `http://${host}`);
  const roomId = roomFromRequest(req);
  const userId = url.searchParams.get('userId') || null;

  console.log(`[Yjs Server] Client connected to room: ${roomId}, userId: ${userId}`);

  conn.binaryType = 'arraybuffer';
  const doc = await getYDoc(roomId);
  doc.conns.set(conn, new Set());

  conn.on('message', (message) => {
    const buf = message instanceof ArrayBuffer ? new Uint8Array(message) : new Uint8Array(message);
    messageListener(conn, doc, buf, userId);
  });

  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) {
        closeConn(doc, conn);
      }
      clearInterval(pingInterval);
      return;
    }
    pongReceived = false;
    try {
      conn.ping();
    } catch {
      closeConn(doc, conn);
      clearInterval(pingInterval);
    }
  }, pingTimeout);

  conn.on('close', () => {
    closeConn(doc, conn);
    clearInterval(pingInterval);
    console.log(`[Yjs Server] Client disconnected from room: ${roomId}`);
  });

  conn.on('pong', () => {
    pongReceived = true;
  });

  conn.on('error', (error) => {
    console.error('[Yjs Server] WebSocket error:', error);
    closeConn(doc, conn);
    clearInterval(pingInterval);
  });

  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));
    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, messageAwareness);
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys()))
      );
      send(doc, conn, encoding.toUint8Array(enc));
    }
  }
});

const shutdown = () => {
  console.log('[Yjs Server] shutting down...');
  wss.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
