/**
 * Yjs WebSocket connection for Collaborative Documentation (notes).
 * Separate from codebook cell service — same transport, note schema.
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { Awareness } from 'y-protocols/awareness';
import {
  colorForUserId,
  getProseFragment,
  getMetaMap,
  seedNoteDocIfEmpty,
  repairDuplicatedTitle,
  commentsToArray,
  addCommentToDoc,
  updateCommentStatusInDoc,
  readTitle,
  setTitle,
  DOC_TITLE_META_KEY,
  type NoteCommentCollab,
} from "@/lib/yjs/yjsNoteSchema"
import { normalizeYjsWsOrigin } from "@/lib/yjs/normalizeYjsWsOrigin"

export interface YjsNoteConnectionConfig {
  wsUrl: string;
  noteId: string;
  userId: string;
  userName?: string;
  color?: string;
}

export interface NoteRemoteCollaborator {
  userId: string;
  userName: string;
  color: string;
  clientId: number;
}

export class YjsNoteCollaborationService {
  private static instances = new Map<string, YjsNoteCollaborationService>();
  private doc: Y.Doc;
  private provider: WebsocketProvider | null = null;
  private awareness: Awareness | null = null;
  private config: YjsNoteConnectionConfig | null = null;
  private isConnected = false;
  private isSynced = false;
  private refCount = 0;
  private connectionListeners = new Set<(connected: boolean) => void>();
  private syncListeners = new Set<(synced: boolean) => void>();
  private awarenessListeners = new Set<() => void>();
  private titleListeners = new Set<() => void>();
  private commentsListeners = new Set<() => void>();
  private titleObserver: (() => void) | null = null;
  private commentsObserver: (() => void) | null = null;

  private constructor(config: YjsNoteConnectionConfig) {
    this.config = config;
    this.doc = new Y.Doc();
  }

  static getInstance(config: YjsNoteConnectionConfig): YjsNoteCollaborationService {
    const roomId = `note-${config.noteId}`;
    const key = `${config.wsUrl}:${roomId}`;
    if (!YjsNoteCollaborationService.instances.has(key)) {
      YjsNoteCollaborationService.instances.set(key, new YjsNoteCollaborationService(config));
    }
    const instance = YjsNoteCollaborationService.instances.get(key)!;
    instance.config = { ...config };
    return instance;
  }

  /** Return an already-connected note room without creating a new one. */
  static peekInstance(wsUrl: string, noteId: string): YjsNoteCollaborationService | null {
    const key = `${wsUrl}:note-${noteId}`;
    return YjsNoteCollaborationService.instances.get(key) || null;
  }

  get roomId(): string {
    return `note-${this.config?.noteId || ''}`;
  }

  connect(): void {
    this.refCount += 1;
    if (this.provider || !this.config) {
      // Already connected — still refresh awareness for this user if needed
      if (this.provider && this.config) this.setupAwareness();
      return;
    }

    const origin = normalizeYjsWsOrigin(this.config.wsUrl);
    const roomId = this.roomId;
    const params = {
      room: roomId,
      userId: this.config.userId,
      userName: this.config.userName || '',
    };
    const exactUrl = `${origin}?${new URLSearchParams(params).toString()}`;

    this.provider = new WebsocketProvider(origin, roomId, this.doc, {
      connect: false,
      params,
    });
    Object.defineProperty(this.provider, 'url', {
      configurable: true,
      get: () => exactUrl,
    });
    this.awareness = this.provider.awareness;

    this.provider.on('status', (event: { status: string }) => {
      this.isConnected = event.status === 'connected';
      this.connectionListeners.forEach((l) => l(this.isConnected));
    });

    this.provider.on('sync', (synced: boolean) => {
      this.isSynced = synced;
      this.syncListeners.forEach((l) => l(synced));
    });

    console.info('[Yjs Note] Connecting', exactUrl);
    this.provider.connect();
    this.setupAwareness();
    this.setupObservers();
  }

  private setupAwareness(): void {
    if (!this.awareness || !this.config) return;
    this.awareness.setLocalStateField('user', {
      userId: this.config.userId,
      userName: this.config.userName || '',
      color: this.config.color || colorForUserId(this.config.userId),
      timestamp: Date.now(),
    });
    this.awareness.on('change', () => {
      this.awarenessListeners.forEach((l) => l());
    });
  }

  private setupObservers(): void {
    const meta = getMetaMap(this.doc);
    this.titleObserver = ((event: Y.YMapEvent<any>) => {
      if (event.keysChanged.has(DOC_TITLE_META_KEY)) {
        this.titleListeners.forEach((l) => l());
      }
    }) as () => void;
    meta.observe(this.titleObserver as (event: Y.YMapEvent<any>) => void);

    const ycomments = this.doc.getArray('comments');
    this.commentsObserver = () => {
      this.commentsListeners.forEach((l) => l());
    };
    ycomments.observeDeep(this.commentsObserver);
  }

  disconnect(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount > 0) return;

    if (this.titleObserver) {
      getMetaMap(this.doc).unobserve(this.titleObserver);
      this.titleObserver = null;
    }
    if (this.commentsObserver) {
      this.doc.getArray('comments').unobserveDeep(this.commentsObserver);
      this.commentsObserver = null;
    }
    if (this.awareness) {
      this.awareness.setLocalState(null);
    }
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }
    this.isConnected = false;
    this.isSynced = false;
    this.connectionListeners.forEach((l) => l(false));
  }

  getDoc(): Y.Doc {
    return this.doc;
  }

  getFragment(): Y.XmlFragment {
    return getProseFragment(this.doc);
  }

  getAwareness(): Awareness | null {
    return this.awareness;
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  getSyncStatus(): boolean {
    return this.isSynced;
  }

  seedIfEmpty(seed: { title?: string; htmlOrText?: string }): void {
    seedNoteDocIfEmpty(this.doc, seed);
    repairDuplicatedTitle(this.doc);
  }

  getTitle(): string {
    return readTitle(this.doc);
  }

  setTitle(title: string): void {
    setTitle(this.doc, title);
  }

  getComments(): NoteCommentCollab[] {
    return commentsToArray(this.doc);
  }

  addComment(comment: Parameters<typeof addCommentToDoc>[1]): void {
    addCommentToDoc(this.doc, comment);
  }

  updateCommentStatus(commentId: string, status: NoteCommentCollab['status']): void {
    updateCommentStatusInDoc(this.doc, commentId, status);
  }

  getCollaborators(): NoteRemoteCollaborator[] {
    const result: NoteRemoteCollaborator[] = [];
    if (!this.awareness) return result;
    const myId = this.awareness.clientID;
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId === myId) return;
      const user = state.user;
      if (!user) return;
      result.push({
        userId: user.userId || String(clientId),
        userName: user.userName || `User ${String(clientId).slice(-4)}`,
        color: user.color || colorForUserId(String(user.userId || clientId)),
        clientId,
      });
    });
    return result;
  }

  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  onSyncChange(listener: (synced: boolean) => void): () => void {
    this.syncListeners.add(listener);
    return () => this.syncListeners.delete(listener);
  }

  onAwarenessChange(listener: () => void): () => void {
    this.awarenessListeners.add(listener);
    return () => this.awarenessListeners.delete(listener);
  }

  onTitleChange(listener: () => void): () => void {
    this.titleListeners.add(listener);
    return () => this.titleListeners.delete(listener);
  }

  onCommentsChange(listener: () => void): () => void {
    this.commentsListeners.add(listener);
    return () => this.commentsListeners.delete(listener);
  }

  destroy(): void {
    this.disconnect();
    if (this.refCount > 0) return;
    this.connectionListeners.clear();
    this.syncListeners.clear();
    this.awarenessListeners.clear();
    this.titleListeners.clear();
    this.commentsListeners.clear();
    if (this.config) {
      YjsNoteCollaborationService.instances.delete(
        `${this.config.wsUrl}:${this.roomId}`
      );
    }
  }
}
