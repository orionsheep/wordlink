'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, StickyNote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import WordNote from '@/components/WordNote';
import { MODULE_REGISTRY, type WordModuleProps } from '@/types/modules';
import ModuleAccordion from './ModuleAccordion';

interface NoteItem {
  id: string;
  content: string;
  createdAt: string;
  userId?: string;
}

interface CommunityNotesModuleProps extends WordModuleProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function CommunityNotesModule({ word, currentUserId, collapsed, onToggle, onScrollToNotes }: CommunityNotesModuleProps) {
  const t = useTranslations();
  const [addNoteWord, setAddNoteWord] = useState<string | null>(null);
  const [notesState, setNotesState] = useState<{ key: string; items: NoteItem[]; error: string | null }>({
    key: '',
    items: [],
    error: null,
  });
  const [refreshTick, setRefreshTick] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);

  const requestKey = !collapsed && word && currentUserId ? `${currentUserId}:${word.trim().toLowerCase()}` : '';
  const showAddNote = !collapsed && addNoteWord === word;
  const myNotes = notesState.key === requestKey ? notesState.items : [];
  const error = notesState.key === requestKey ? notesState.error : null;

  useEffect(() => {
    if (!requestKey || !word || !currentUserId || collapsed) return;
    let disposed = false;
    const controller = new AbortController();
    fetch(`/api/notes?word=${encodeURIComponent(word)}`, { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load notes');
        return response.json() as Promise<NoteItem[]>;
      })
      .then((notes) => {
        if (disposed) return;
        setNotesState({
          key: requestKey,
          items: Array.isArray(notes) ? notes.filter((note) => note.userId === currentUserId) : [],
          error: null,
        });
      })
      .catch((reason: unknown) => {
        if (disposed || (reason instanceof DOMException && reason.name === 'AbortError')) return;
        setNotesState({
          key: requestKey,
          items: [],
          error: t('wordDetail.errorLoading'),
        });
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [requestKey, word, currentUserId, collapsed, refreshTick, t]);

  useEffect(() => {
    if (!word || !currentUserId || collapsed) return;
    const normalizedWord = word.trim().toLowerCase();
    const handleNotesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ word?: string }>).detail;
      if (detail?.word && detail.word.trim().toLowerCase() === normalizedWord) {
        setRefreshTick((v) => v + 1);
      }
    };
    window.addEventListener('word-notes-updated', handleNotesUpdated);
    return () => window.removeEventListener('word-notes-updated', handleNotesUpdated);
  }, [word, currentUserId, collapsed]);

  return (
    <div ref={anchorRef}>
      <ModuleAccordion
        meta={MODULE_REGISTRY.community_notes}
        collapsed={collapsed}
        onToggle={onToggle}
        action={onScrollToNotes ? <button type="button" onClick={onScrollToNotes} className="text-xs text-blue-400 hover:text-blue-300">{t('wordDetail.jumpToNotes')}</button> : undefined}
      >
        <div className="space-y-3">
          {!collapsed && currentUserId && (
            <button
              type="button"
              onClick={() => setAddNoteWord((prev) => (prev === word ? null : word))}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-300 hover:text-white"
            >
              <MessageSquarePlus size={14} />
              {showAddNote ? t('wordDetail.collapse') : t('wordDetail.quickAddNote')}
            </button>
          )}
          {!collapsed && showAddNote && currentUserId && <WordNote word={word} currentUserId={currentUserId} compact />}
          {error && <p className="text-sm text-amber-400">{error}</p>}
          {!collapsed && currentUserId && myNotes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-blue-400"><StickyNote size={12} />{t('wordDetail.myNotes')}</div>
              {myNotes.map((note) => (
                <article key={note.id} className="rounded-lg border border-blue-900/50 bg-blue-950/30 p-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">{note.content}</p>
                  <time className="mt-2 block text-xs text-neutral-600">{new Date(note.createdAt).toLocaleDateString('zh-CN')}</time>
                </article>
              ))}
            </div>
          )}
          {!collapsed && (currentUserId ? <WordNote word={word} currentUserId={currentUserId} /> : <p className="py-4 text-center text-sm text-neutral-500">{t('wordDetail.loginToViewNotes')}</p>)}
        </div>
      </ModuleAccordion>
    </div>
  );
}
