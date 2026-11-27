'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowLeft, Plus, Trash2, Save, AlertCircle, Lock, RotateCcw } from 'lucide-react';

interface Word {
  id: string;
  word: string;
  sequence: number;
}

interface Library {
  id: string;
  name: string;
  description?: string;
  wordCount: number;
}

type LoadError = 'unauthorized' | 'forbidden' | 'not_found' | 'network' | null;

function notifyLibraryMutated(libraryId: string) {
  if (typeof window === 'undefined') return;
  try {
    const prefix = `wordList:user:${libraryId}`;
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(prefix)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage access errors
  }
  window.dispatchEvent(new CustomEvent('user-library-updated', { detail: { libraryId } }));
}

export default function EditLibraryPage() {
  const t = useTranslations('libraryEdit');
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const libraryId = params.id as string;

  const [library, setLibrary] = useState<Library | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const activeKey = `${libraryId}:${reloadTick}`;
  const [loadedKey, setLoadedKey] = useState('');
  const [loadError, setLoadError] = useState<LoadError>(null);
  const [saving, setSaving] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const loading = loadedKey !== activeKey;

  useEffect(() => {
    const controller = new AbortController();
    const currentKey = `${libraryId}:${reloadTick}`;

    async function load() {
      try {
        const [libRes, wordsRes] = await Promise.all([
          fetch(`/api/user/libraries/${libraryId}`, { credentials: 'include', signal: controller.signal }),
          fetch(`/api/user/libraries/${libraryId}/words`, { credentials: 'include', signal: controller.signal }),
        ]);

        if (controller.signal.aborted) return;

        const statuses = [libRes.status, wordsRes.status];
        if (statuses.includes(401)) {
          setLibrary(null);
          setWords([]);
          setSelectedWords(new Set());
          setLoadError('unauthorized');
          return;
        }
        if (statuses.includes(403)) {
          setLibrary(null);
          setWords([]);
          setSelectedWords(new Set());
          setLoadError('forbidden');
          return;
        }
        if (statuses.includes(404)) {
          setLibrary(null);
          setWords([]);
          setSelectedWords(new Set());
          setLoadError('not_found');
          return;
        }
        if (!libRes.ok || !wordsRes.ok) {
          setLibrary(null);
          setWords([]);
          setSelectedWords(new Set());
          setLoadError('network');
          return;
        }

        const [libData, wordsData] = await Promise.all([libRes.json(), wordsRes.json()]);
        if (controller.signal.aborted) return;

        if (!libData?.library) {
          setLibrary(null);
          setWords([]);
          setSelectedWords(new Set());
          setLoadError('not_found');
          return;
        }

        setLibrary(libData.library);
        setWords(Array.isArray(wordsData?.words) ? wordsData.words : []);
        setSelectedWords(new Set());
        setLoadError(null);
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return;
        }
        console.error('Error loading library:', err);
        setLibrary(null);
        setWords([]);
        setSelectedWords(new Set());
        setLoadError('network');
      } finally {
        if (!controller.signal.aborted) {
          setLoadedKey(currentKey);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [libraryId, reloadTick]);

  const handleAddWord = async () => {
    if (!newWord.trim()) return;

    setError('');
    try {
      const response = await fetch(`/api/user/libraries/${libraryId}/words`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: newWord.trim() }),
        credentials: 'include',
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.word) {
        setWords((prev) => [...prev, data.word]);
        setLibrary((prev) => (prev ? { ...prev, wordCount: prev.wordCount + 1 } : prev));
        setNewWord('');
        notifyLibraryMutated(libraryId);
      } else {
        setError(locale === 'zh' ? t('addFailed') : (data.error || t('addFailed')));
      }
    } catch {
      setError(t('addFailed'));
    }
  };

  const handleDeleteWord = async (wordId: string) => {
    setError('');
    try {
      const response = await fetch(
        `/api/user/libraries/${libraryId}/words/${wordId}`,
        { method: 'DELETE', credentials: 'include' }
      );

      if (response.ok) {
        setWords((prev) => prev.filter((w) => w.id !== wordId));
        setLibrary((prev) =>
          prev ? { ...prev, wordCount: Math.max(0, prev.wordCount - 1) } : prev
        );
        setSelectedWords((prev) => {
          const next = new Set(prev);
          next.delete(wordId);
          return next;
        });
        notifyLibraryMutated(libraryId);
      } else {
        setError(t('deleteFailed'));
      }
    } catch (err) {
      console.error('Error deleting word:', err);
      setError(t('deleteFailed'));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedWords.size === 0) return;

    if (!confirm(t('confirmDelete', { count: selectedWords.size }))) return;

    setError('');
    const deletedIds = new Set(selectedWords);
    try {
      const response = await fetch(`/api/user/libraries/${libraryId}/words`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordIds: Array.from(deletedIds) }),
        credentials: 'include',
      });

      if (response.ok) {
        setWords((prev) => prev.filter((w) => !deletedIds.has(w.id)));
        setLibrary((prev) =>
          prev ? { ...prev, wordCount: Math.max(0, prev.wordCount - deletedIds.size) } : prev
        );
        setSelectedWords(new Set());
        notifyLibraryMutated(libraryId);
      } else {
        setError(t('deleteFailed'));
      }
    } catch (err) {
      console.error('Error batch deleting:', err);
      setError(t('deleteFailed'));
    }
  };

  const handleUpdateLibrary = async () => {
    if (!library) return;

    setError('');
    setSaving(true);
    try {
      const response = await fetch(`/api/user/libraries/${libraryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: library.name,
          description: library.description,
        }),
        credentials: 'include',
      });

      if (response.ok) {
        notifyLibraryMutated(libraryId);
        router.push('/my-libraries');
      } else {
        setError(t('saveFailed'));
      }
    } catch (err) {
      console.error('Error updating library:', err);
      setError(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedWords.size === words.length) {
      setSelectedWords(new Set());
    } else {
      setSelectedWords(new Set(words.map((w) => w.id)));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-xl">{t('loading')}</div>
      </div>
    );
  }

  if (loadError || !library) {
    const isUnauthorized = loadError === 'unauthorized';
    const isForbidden = loadError === 'forbidden';
    const isNotFound = loadError === 'not_found' || !loadError;

    const title = isUnauthorized
      ? t('unauthorizedTitle')
      : isForbidden
      ? t('forbiddenTitle')
      : isNotFound
      ? t('notFoundTitle')
      : t('networkErrorTitle');

    const desc = isUnauthorized
      ? t('unauthorizedDesc')
      : isForbidden
      ? t('forbiddenDesc')
      : isNotFound
      ? t('notFoundDesc')
      : t('networkErrorDesc');

    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center space-y-5">
          {isUnauthorized ? (
            <Lock size={36} className="mx-auto text-amber-400" />
          ) : (
            <AlertCircle size={36} className="mx-auto text-red-400" />
          )}
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white">{title}</h1>
            <p className="text-sm text-gray-400">{desc}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {isUnauthorized && (
              <Link
                href="/login"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
              >
                {t('loginButton')}
              </Link>
            )}
            {loadError === 'network' && (
              <button
                type="button"
                onClick={() => setReloadTick((v) => v + 1)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white inline-flex items-center gap-2 transition-colors"
              >
                <RotateCcw size={15} />
                {t('retry')}
              </button>
            )}
            <Link
              href="/my-libraries"
              className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium text-gray-200 inline-flex items-center gap-2 transition-colors"
            >
              <ArrowLeft size={15} />
              {t('backToLibraries')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            type="button"
            onClick={() => router.push('/my-libraries')}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{t('title')}</h1>
          </div>
          <button
            type="button"
            onClick={handleUpdateLibrary}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Save size={20} />
            {saving ? t('saving') : t('save')}
          </button>
        </div>

        {/* Library Info */}
        <div className="bg-gray-900 rounded-lg p-6 mb-8 border border-gray-800">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t('nameLabel')}</label>
              <input
                type="text"
                value={library.name}
                onChange={(e) =>
                  setLibrary({ ...library, name: e.target.value })
                }
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('descriptionLabel')}
              </label>
              <textarea
                value={library.description || ''}
                onChange={(e) =>
                  setLibrary({ ...library, description: e.target.value })
                }
                rows={3}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Add Word */}
        <div className="bg-gray-900 rounded-lg p-6 mb-8 border border-gray-800">
          <h2 className="text-xl font-semibold mb-4">{t('addNewWord')}</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddWord()}
              placeholder={t('wordPlaceholder')}
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
            />
            <button
              type="button"
              onClick={handleAddWord}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus size={20} />
              {t('add')}
            </button>
          </div>
          {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
        </div>

        {/* Words List */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              {t('wordsCount', { count: words.length })}
            </h2>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
              >
                {selectedWords.size === words.length ? t('deselectAll') : t('selectAll')}
              </button>
              {selectedWords.size > 0 && (
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm flex items-center gap-2 transition-colors"
                >
                  <Trash2 size={16} />
                  {t('deleteCount', { count: selectedWords.size })}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {words.map((word) => (
              <div
                key={word.id}
                className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedWords.has(word.id)}
                  onChange={(e) => {
                    const next = new Set(selectedWords);
                    if (e.target.checked) {
                      next.add(word.id);
                    } else {
                      next.delete(word.id);
                    }
                    setSelectedWords(next);
                  }}
                  className="w-4 h-4"
                />
                <span className="text-gray-400 text-sm w-12">
                  #{word.sequence}
                </span>
                <span className="flex-1">{word.word}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteWord(word.id)}
                  className="p-2 hover:bg-gray-700 rounded-lg text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

