/**
 * React hook for Google Docs-style note collaboration via Yjs + TipTap.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import {
  YjsNoteCollaborationService,
  type NoteRemoteCollaborator,
} from "@/lib/yjs/yjsNoteCollaborationService"
import {
  colorForUserId,
  getSeedHtml,
  clearSeedHtml,
  collapseRepeatedTitle,
  type NoteCommentCollab,
} from "@/lib/yjs/yjsNoteSchema"

export interface UseYjsNoteCollaborationOptions {
  noteId: string | null;
  userId: string;
  userName?: string;
  wsUrl: string;
  enabled?: boolean;
  /** Initial title / HTML from Supabase (legacy seed). */
  seedTitle?: string;
  seedHtml?: string;
}

export function useYjsNoteCollaboration(options: UseYjsNoteCollaborationOptions) {
  const {
    noteId,
    userId,
    userName,
    wsUrl,
    enabled = true,
    seedTitle = '',
    seedHtml = '',
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [title, setTitleState] = useState(seedTitle);
  const [collaborators, setCollaborators] = useState<NoteRemoteCollaborator[]>([]);
  const [comments, setComments] = useState<NoteCommentCollab[]>([]);
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [fragment, setFragment] = useState<Y.XmlFragment | null>(null);
  const [awareness, setAwareness] = useState<Awareness | null>(null);
  const [seedHtmlOnce, setSeedHtmlOnce] = useState<string>('');

  const serviceRef = useRef<YjsNoteCollaborationService | null>(null);
  const color = colorForUserId(userId);

  useEffect(() => {
    if (!enabled || !noteId) {
      serviceRef.current?.destroy();
      serviceRef.current = null;
      setYdoc(null);
      setFragment(null);
      setAwareness(null);
      setIsConnected(false);
      setIsSynced(false);
      return;
    }

    const service = YjsNoteCollaborationService.getInstance({
      wsUrl,
      noteId,
      userId,
      userName,
      color,
    });
    serviceRef.current = service;
    service.connect();
    service.seedIfEmpty({ title: seedTitle, htmlOrText: seedHtml });

    setYdoc(service.getDoc());
    setFragment(service.getFragment());
    setAwareness(service.getAwareness());
    setTitleState(collapseRepeatedTitle(service.getTitle() || seedTitle));
    setComments(service.getComments());
    setCollaborators(service.getCollaborators());
    setIsConnected(service.getConnectionStatus());
    setIsSynced(service.getSyncStatus());

    const unsubConn = service.onConnectionChange(setIsConnected);
    const unsubSync = service.onSyncChange((synced) => {
      setIsSynced(synced);
      if (synced) {
        // Repair any already-duplicated titles after peers merge
        service.seedIfEmpty({ title: seedTitle, htmlOrText: seedHtml });
        setTitleState(collapseRepeatedTitle(service.getTitle() || seedTitle));
        const seed = getSeedHtml(service.getDoc());
        if (seed) {
          setSeedHtmlOnce(seed);
        }
        setComments(service.getComments());
        setCollaborators(service.getCollaborators());
      }
    });
    const unsubAwareness = service.onAwarenessChange(() => {
      setCollaborators(service.getCollaborators());
    });
    const unsubTitle = service.onTitleChange(() => {
      setTitleState(collapseRepeatedTitle(service.getTitle()));
    });
    const unsubComments = service.onCommentsChange(() => {
      setComments(service.getComments());
    });

    return () => {
      unsubConn();
      unsubSync();
      unsubAwareness();
      unsubTitle();
      unsubComments();
      service.destroy();
      if (serviceRef.current === service) {
        serviceRef.current = null;
      }
    };
    // seed only used on connect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, noteId, userId, userName, wsUrl, color]);

  const setTitle = useCallback((next: string) => {
    setTitleState(next);
    const service = serviceRef.current;
    if (!service) return;
    if (service.getTitle() === next) return;
    service.setTitle(next);
  }, []);

  const addComment = useCallback(
    (payload: { id: string; text: string; quote?: string }) => {
      serviceRef.current?.addComment({
        id: payload.id,
        authorId: userId,
        authorName: userName || 'User',
        text: payload.text,
        quote: payload.quote,
      });
    },
    [userId, userName]
  );

  const updateCommentStatus = useCallback(
    (commentId: string, status: NoteCommentCollab['status']) => {
      serviceRef.current?.updateCommentStatus(commentId, status);
    },
    []
  );

  const consumeSeedHtml = useCallback(() => {
    const html = seedHtmlOnce;
    if (serviceRef.current) {
      clearSeedHtml(serviceRef.current.getDoc());
    }
    setSeedHtmlOnce('');
    return html;
  }, [seedHtmlOnce]);

  return {
    isConnected,
    isSynced,
    title,
    setTitle,
    collaborators,
    comments,
    addComment,
    updateCommentStatus,
    ydoc,
    fragment,
    awareness,
    userColor: color,
    seedHtmlOnce,
    consumeSeedHtml,
    service: serviceRef.current,
  };
}
