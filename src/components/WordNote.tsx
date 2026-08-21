'use client';

import { useEffect, useState } from 'react';
import { Heart, MessageCircle, Star, Pencil, Trash2, Send } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';

interface Note {
    id: string;
    userId: string;
    word: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    user: {
        id: string;
        username: string;
    };
    likeCount: number;
    favoriteCount: number;
    commentCount: number;
    hasUserLiked: boolean;
    hasUserFavorited: boolean;
    comments: {
        content: string;
        username: string;
        createdAt: string;
    }[];
}

interface WordNoteProps {
    word: string;
    currentUserId?: string;
    compact?: boolean;  // Compact mode: only show create note section
}

export default function WordNote({ word, currentUserId, compact = false }: WordNoteProps) {
    const t = useTranslations();
    const locale = useLocale();
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [newNoteContent, setNewNoteContent] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [commentingNoteId, setCommentingNoteId] = useState<string | null>(null);
    const [commentContent, setCommentContent] = useState('');

    useEffect(() => {
        fetchNotes();
    }, [word]);

    const fetchNotes = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/notes?word=${encodeURIComponent(word)}`, {
                credentials: 'include'
            });
            if (res.ok) {
                const data = await res.json();
                setNotes(data);
            }
        } catch (error) {
            console.error('Failed to fetch notes:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNote = async () => {
        if (!newNoteContent.trim()) return;

        try {
            setIsCreating(true);
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ word, content: newNoteContent }),
                credentials: 'include'
            });

            if (res.ok) {
                setNewNoteContent('');
                await fetchNotes();
            }
        } catch (error) {
            console.error('Failed to create note:', error);
        } finally {
            setIsCreating(false);
        }
    };

    const handleUpdateNote = async (noteId: string) => {
        if (!editContent.trim()) return;

        try {
            const res = await fetch(`/api/notes/${noteId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editContent }),
                credentials: 'include'
            });

            if (res.ok) {
                setEditingNoteId(null);
                setEditContent('');
                await fetchNotes();
            }
        } catch (error) {
            console.error('Failed to update note:', error);
        }
    };

    const handleDeleteNote = async (noteId: string) => {
        const confirmMsg = locale === 'zh' ? '确定要删除这条笔记吗？' : 'Are you sure you want to delete this note?';
        if (!confirm(confirmMsg)) return;

        try {
            const res = await fetch(`/api/notes/${noteId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (res.ok) {
                await fetchNotes();
            }
        } catch (error) {
            console.error('Failed to delete note:', error);
        }
    };

    const handleInteract = async (noteId: string, type: 'like' | 'favorite') => {
        try {
            const res = await fetch(`/api/notes/${noteId}/interact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type }),
                credentials: 'include'
            });

            if (res.ok) {
                await fetchNotes();
            }
        } catch (error) {
            console.error('Failed to interact:', error);
        }
    };

    const handleComment = async (noteId: string) => {
        if (!commentContent.trim()) return;

        try {
            const res = await fetch(`/api/notes/${noteId}/interact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'comment', content: commentContent }),
                credentials: 'include'
            });

            if (res.ok) {
                setCommentingNoteId(null);
                setCommentContent('');
                await fetchNotes();
            }
        } catch (error) {
            console.error('Failed to comment:', error);
        }
    };

    const userNotes = notes.filter(note => note.userId === currentUserId);
    const otherNotes = notes.filter(note => note.userId !== currentUserId);

    if (loading) {
        return (
            <div className="py-8 text-center text-neutral-500">
                {t('common.loading') || 'Loading...'}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Create Note Section */}
            <div className={`${compact ? '' : 'bg-neutral-900 border border-neutral-800 rounded-xl p-4'}`}>
                {!compact && <h3 className="text-xs font-medium text-neutral-500 mb-2">{t('wordDetail.addNote')}</h3>}
                <div className="relative">
                    <textarea
                        value={newNoteContent}
                        onChange={(e) => setNewNoteContent(e.target.value)}
                        placeholder={t('wordDetail.notePlaceholder') || 'Write your notes or memory tricks here...'}
                        className="w-full bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-lg p-3 pr-16 text-sm resize-none focus:outline-none focus:border-blue-500"
                        rows={compact ? 2 : 2}
                    />
                    <button
                        onClick={handleCreateNote}
                        disabled={!newNoteContent.trim() || isCreating}
                        className="absolute right-2 bottom-2 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs rounded transition-colors"
                    >
                        {isCreating ? '...' : (t('common.submit') || 'Post')}
                    </button>
                </div>
            </div>

            {/* User's Notes */}
            {!compact && userNotes.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold text-blue-400 mb-3">{t('wordDetail.myNotes')}</h3>
                    {userNotes.map(note => (
                        <NoteCard
                            key={note.id}
                            note={note}
                            isOwner={true}
                            isEditing={editingNoteId === note.id}
                            editContent={editContent}
                            setEditContent={setEditContent}
                            onStartEdit={() => {
                                setEditingNoteId(note.id);
                                setEditContent(note.content);
                            }}
                            onCancelEdit={() => {
                                setEditingNoteId(null);
                                setEditContent('');
                            }}
                            onSaveEdit={() => handleUpdateNote(note.id)}
                            onDelete={() => handleDeleteNote(note.id)}
                            onLike={() => handleInteract(note.id, 'like')}
                            onFavorite={() => handleInteract(note.id, 'favorite')}
                            commentingNoteId={commentingNoteId}
                            setCommentingNoteId={setCommentingNoteId}
                            commentContent={commentContent}
                            setCommentContent={setCommentContent}
                            onComment={() => handleComment(note.id)}
                            locale={locale}
                            t={t}
                        />
                    ))}
                </div>
            )}

            {/* Other Users' Notes */}
            {!compact && otherNotes.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold text-neutral-400 mb-3">{t('wordDetail.publicNotes')}</h3>
                    <div className="space-y-3">
                        {otherNotes.map(note => (
                            <NoteCard
                                key={note.id}
                                note={note}
                                isOwner={false}
                                onLike={() => handleInteract(note.id, 'like')}
                                onFavorite={() => handleInteract(note.id, 'favorite')}
                                commentingNoteId={commentingNoteId}
                                setCommentingNoteId={setCommentingNoteId}
                                commentContent={commentContent}
                                setCommentContent={setCommentContent}
                                onComment={() => handleComment(note.id)}
                                locale={locale}
                                t={t}
                            />
                        ))}
                    </div>
                </div>
            )}

            {!compact && notes.length === 0 && (
                <div className="text-center py-12 text-neutral-500">
                    {t('wordDetail.noNotes')}
                </div>
            )}
        </div>
    );
}

interface NoteCardProps {
    note: Note;
    isOwner: boolean;
    isEditing?: boolean;
    editContent?: string;
    setEditContent?: (content: string) => void;
    onStartEdit?: () => void;
    onCancelEdit?: () => void;
    onSaveEdit?: () => void;
    onDelete?: () => void;
    onLike: () => void;
    onFavorite: () => void;
    commentingNoteId: string | null;
    setCommentingNoteId: (id: string | null) => void;
    commentContent: string;
    setCommentContent: (content: string) => void;
    onComment: () => void;
    locale: string;
    t: ReturnType<typeof useTranslations>;
}

function NoteCard({
    note,
    isOwner,
    isEditing,
    editContent,
    setEditContent,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onDelete,
    onLike,
    onFavorite,
    commentingNoteId,
    setCommentingNoteId,
    commentContent,
    setCommentContent,
    onComment,
    locale,
    t,
}: NoteCardProps) {
    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 mb-3">
            <div className="flex items-start justify-between mb-3">
                <div>
                    <span className="text-sm font-medium text-neutral-300">{note.user.username}</span>
                    <span className="text-xs text-neutral-600 ml-2">
                        {new Date(note.createdAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')}
                    </span>
                </div>
                {isOwner && !isEditing && (
                    <div className="flex gap-2">
                        <button
                            onClick={onStartEdit}
                            className="p-1 text-neutral-500 hover:text-blue-500 transition-colors"
                            title={t('common.edit')}
                        >
                            <Pencil size={14} />
                        </button>
                        <button
                            onClick={onDelete}
                            className="p-1 text-neutral-500 hover:text-red-500 transition-colors"
                            title={t('common.delete')}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}
            </div>

            {isEditing ? (
                <div>
                    <textarea
                        value={editContent}
                        onChange={(e) => setEditContent?.(e.target.value)}
                        className="w-full bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-blue-500 mb-2"
                        rows={3}
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={onCancelEdit}
                            className="px-3 py-1 text-sm text-neutral-400 hover:text-white transition-colors"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            onClick={onSaveEdit}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
                        >
                            {t('common.save')}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <p className="text-sm text-neutral-300 leading-relaxed mb-3 whitespace-pre-wrap">
                        {note.content}
                    </p>

                    {/* Interactions */}
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                        <button
                            onClick={onLike}
                            className={`flex items-center gap-1 hover:text-red-500 transition-colors ${note.hasUserLiked ? 'text-red-500' : ''}`}
                        >
                            <Heart size={14} className={note.hasUserLiked ? 'fill-current' : ''} />
                            {note.likeCount > 0 && note.likeCount}
                        </button>
                        <button
                            onClick={onFavorite}
                            className={`flex items-center gap-1 hover:text-yellow-500 transition-colors ${note.hasUserFavorited ? 'text-yellow-500' : ''}`}
                        >
                            <Star size={14} className={note.hasUserFavorited ? 'fill-current' : ''} />
                            {note.favoriteCount > 0 && note.favoriteCount}
                        </button>
                        <button
                            onClick={() => setCommentingNoteId(commentingNoteId === note.id ? null : note.id)}
                            className="flex items-center gap-1 hover:text-blue-500 transition-colors"
                        >
                            <MessageCircle size={14} />
                            {note.commentCount > 0 && note.commentCount}
                        </button>
                    </div>

                    {/* Comments */}
                    {note.comments.length > 0 && (
                        <div className="mt-3 space-y-2 pl-4 border-l-2 border-neutral-800">
                            {note.comments.map((comment, idx) => (
                                <div key={idx} className="text-xs">
                                    <span className="text-blue-400 font-medium">{comment.username}</span>
                                    <span className="text-neutral-500 mx-2">·</span>
                                    <span className="text-neutral-400">{comment.content}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Comment Input */}
                    {commentingNoteId === note.id && (
                        <div className="mt-3 flex gap-2">
                            <input
                                type="text"
                                value={commentContent}
                                onChange={(e) => setCommentContent(e.target.value)}
                                placeholder={locale === 'zh' ? '写下你的评论...' : 'Write a comment...'}
                                className="flex-1 bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        onComment();
                                    }
                                }}
                            />
                            <button
                                onClick={onComment}
                                disabled={!commentContent.trim()}
                                className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                            >
                                <Send size={16} />
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
