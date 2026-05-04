'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';

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

export default function EditLibraryPage() {
  const router = useRouter();
  const params = useParams();
  const libraryId = params.id as string;

  const [library, setLibrary] = useState<Library | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLibrary();
    fetchWords();
  }, [libraryId]);

  const fetchLibrary = async () => {
    try {
      const response = await fetch(`/api/user/libraries/${libraryId}`);
      if (response.ok) {
        const data = await response.json();
        setLibrary(data.library);
      }
    } catch (error) {
      console.error('Error fetching library:', error);
    }
  };

  const fetchWords = async () => {
    try {
      const response = await fetch(`/api/user/libraries/${libraryId}/words`);
      if (response.ok) {
        const data = await response.json();
        setWords(data.words);
      }
    } catch (error) {
      console.error('Error fetching words:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddWord = async () => {
    if (!newWord.trim()) return;

    setError('');
    try {
      const response = await fetch(`/api/user/libraries/${libraryId}/words`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: newWord.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setWords([...words, data.word]);
        setNewWord('');
      } else {
        setError(data.error || 'Failed to add word');
      }
    } catch (error) {
      setError('Failed to add word');
    }
  };

  const handleDeleteWord = async (wordId: string) => {
    try {
      const response = await fetch(
        `/api/user/libraries/${libraryId}/words/${wordId}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        setWords(words.filter((w) => w.id !== wordId));
        setSelectedWords((prev) => {
          const next = new Set(prev);
          next.delete(wordId);
          return next;
        });
      }
    } catch (error) {
      console.error('Error deleting word:', error);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedWords.size === 0) return;

    if (!confirm(`Delete ${selectedWords.size} selected words?`)) return;

    try {
      const response = await fetch(`/api/user/libraries/${libraryId}/words`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordIds: Array.from(selectedWords) }),
      });

      if (response.ok) {
        setWords(words.filter((w) => !selectedWords.has(w.id)));
        setSelectedWords(new Set());
      }
    } catch (error) {
      console.error('Error batch deleting:', error);
    }
  };

  const handleUpdateLibrary = async () => {
    if (!library) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/user/libraries/${libraryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: library.name,
          description: library.description,
        }),
      });

      if (response.ok) {
        router.push('/my-libraries');
      }
    } catch (error) {
      console.error('Error updating library:', error);
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

  if (loading || !library) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push('/my-libraries')}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Edit Library</h1>
          </div>
          <button
            onClick={handleUpdateLibrary}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Save size={20} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Library Info */}
        <div className="bg-gray-900 rounded-lg p-6 mb-8 border border-gray-800">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
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
                Description
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
          <h2 className="text-xl font-semibold mb-4">Add New Word</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddWord()}
              placeholder="Enter a word..."
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
            />
            <button
              onClick={handleAddWord}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus size={20} />
              Add
            </button>
          </div>
          {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
        </div>

        {/* Words List */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              Words ({words.length})
            </h2>
            <div className="flex gap-3">
              <button
                onClick={toggleSelectAll}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
              >
                {selectedWords.size === words.length ? 'Deselect All' : 'Select All'}
              </button>
              {selectedWords.size > 0 && (
                <button
                  onClick={handleBatchDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm flex items-center gap-2 transition-colors"
                >
                  <Trash2 size={16} />
                  Delete ({selectedWords.size})
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

