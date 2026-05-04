'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Upload, Trash2, Edit, Play, Search } from 'lucide-react';

interface Library {
  id: string;
  name: string;
  description?: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function MyLibrariesPage() {
  const router = useRouter();
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    file: null as File | null,
    name: '',
    description: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLibraries();
  }, []);

  const fetchLibraries = async () => {
    try {
      const response = await fetch('/api/user/libraries');
      if (response.ok) {
        const data = await response.json();
        setLibraries(data.libraries);
      }
    } catch (error) {
      console.error('Error fetching libraries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        setError('Please select a CSV file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }
      setUploadForm({ ...uploadForm, file });
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!uploadForm.file || !uploadForm.name) {
      setError('Please select a file and enter a name');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', uploadForm.file);
      formData.append('name', uploadForm.name);
      if (uploadForm.description) {
        formData.append('description', uploadForm.description);
      }

      const response = await fetch('/api/user/libraries', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setUploadProgress(100);
        setShowUploadForm(false);
        setUploadForm({ file: null, name: '', description: '' });
        fetchLibraries();
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (error) {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this library?')) {
      return;
    }

    try {
      const response = await fetch(`/api/user/libraries/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchLibraries();
      }
    } catch (error) {
      console.error('Error deleting library:', error);
    }
  };

  const filteredLibraries = libraries.filter((lib) =>
    lib.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">My Word Libraries</h1>
            <p className="text-gray-400">
              Create and manage your custom word collections
            </p>
          </div>
          <button
            onClick={() => setShowUploadForm(!showUploadForm)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Upload size={20} />
            Upload CSV
          </button>
        </div>

        {/* Upload Form */}
        {showUploadForm && (
          <div className="bg-gray-900 rounded-lg p-6 mb-8 border border-gray-800">
            <h2 className="text-xl font-semibold mb-4">Upload New Library</h2>

            <div className="space-y-4">
              {/* File Input */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  CSV File (序号,单词 format)
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                />
                {uploadForm.file && (
                  <p className="text-sm text-gray-400 mt-2">
                    Selected: {uploadForm.file.name} (
                    {(uploadForm.file.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>

              {/* Name Input */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Library Name *
                </label>
                <input
                  type="text"
                  value={uploadForm.name}
                  onChange={(e) =>
                    setUploadForm({ ...uploadForm, name: e.target.value })
                  }
                  placeholder="e.g., TOEFL Vocabulary"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                />
              </div>

              {/* Description Input */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={uploadForm.description}
                  onChange={(e) =>
                    setUploadForm({ ...uploadForm, description: e.target.value })
                  }
                  placeholder="Add a description for this library..."
                  rows={3}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="text-red-500 text-sm">{error}</div>
              )}

              {/* Upload Progress */}
              {uploading && (
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleUpload}
                  disabled={uploading || !uploadForm.file || !uploadForm.name}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
                <button
                  onClick={() => {
                    setShowUploadForm(false);
                    setUploadForm({ file: null, name: '', description: '' });
                    setError('');
                  }}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search libraries..."
              className="w-full pl-10 pr-4 py-3 bg-gray-900 border border-gray-800 rounded-lg"
            />
          </div>
        </div>

        {/* Libraries Grid */}
        {filteredLibraries.length === 0 ? (
          <div className="text-center py-16">
            <FileText size={64} className="mx-auto mb-4 text-gray-600" />
            <h3 className="text-xl font-semibold mb-2">No libraries yet</h3>
            <p className="text-gray-400 mb-6">
              Upload a CSV file to create your first custom word library
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLibraries.map((library) => (
              <div
                key={library.id}
                className="bg-gray-900 rounded-lg p-6 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <FileText size={32} className="text-blue-500" />
                  <div className="flex gap-2">
                    <button
                      onClick={() => router.push(`/my-libraries/${library.id}/edit`)}
                      className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(library.id)}
                      className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-red-500"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <h3 className="text-lg font-semibold mb-2">{library.name}</h3>
                {library.description && (
                  <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                    {library.description}
                  </p>
                )}

                <div className="flex items-center justify-between text-sm text-gray-400 mb-4">
                  <span>{library.wordCount} words</span>
                  <span>{new Date(library.createdAt).toLocaleDateString()}</span>
                </div>

                <button
                  onClick={() => router.push(`/quiz?source=user&libraryId=${library.id}`)}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Play size={16} />
                  Start Quiz
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

