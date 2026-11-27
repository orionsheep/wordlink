'use client';

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Volume2, RotateCcw, Check, X as XIcon, Trophy, AlertCircle, Send } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuizData, type QuizWord } from '@/hooks/useQuizData';
import { useSettings } from '@/context/SettingsContext';
import { safeReturnPath } from '@/lib/safe-path';

interface PendingQuizRecord {
  id: string;
  authRequired?: boolean;
  payload: {
    clientSubmissionId: string;
    word: string;
    testType: number;
    score: number;
    userInput: string;
  };
}

const PENDING_STORAGE_KEY = 'quiz_pending_records_spelling';
const EMPTY_PENDING: PendingQuizRecord[] = [];
let cachedPendingRaw: string | null = null;
let cachedPendingList: PendingQuizRecord[] = EMPTY_PENDING;
const pendingListeners = new Set<() => void>();

function createSubmissionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

function readPendingRecords(): PendingQuizRecord[] {
  if (typeof window === 'undefined') return EMPTY_PENDING;
  try {
    const raw = sessionStorage.getItem(PENDING_STORAGE_KEY);
    if (raw === cachedPendingRaw) return cachedPendingList;
    cachedPendingRaw = raw;
    if (!raw) {
      cachedPendingList = EMPTY_PENDING;
      return cachedPendingList;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cachedPendingList = EMPTY_PENDING;
      return cachedPendingList;
    }
    cachedPendingList = parsed.filter(
      (item): item is PendingQuizRecord =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as PendingQuizRecord).id === 'string' &&
        Boolean((item as PendingQuizRecord).payload) &&
        typeof (item as PendingQuizRecord).payload.clientSubmissionId === 'string' &&
        typeof (item as PendingQuizRecord).payload.word === 'string' &&
        typeof (item as PendingQuizRecord).payload.testType === 'number' &&
        typeof (item as PendingQuizRecord).payload.score === 'number' &&
        typeof (item as PendingQuizRecord).payload.userInput === 'string'
    );
    return cachedPendingList;
  } catch {
    cachedPendingRaw = null;
    cachedPendingList = EMPTY_PENDING;
    return EMPTY_PENDING;
  }
}

function writePendingRecords(next: PendingQuizRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    if (next.length === 0) {
      sessionStorage.removeItem(PENDING_STORAGE_KEY);
      cachedPendingRaw = null;
      cachedPendingList = EMPTY_PENDING;
    } else {
      const serialized = JSON.stringify(next);
      sessionStorage.setItem(PENDING_STORAGE_KEY, serialized);
      cachedPendingRaw = serialized;
      cachedPendingList = next;
    }
  } catch {
    cachedPendingList = next;
  }
  pendingListeners.forEach((listener) => listener());
}

function upsertPendingRecord(record: PendingQuizRecord) {
  const current = readPendingRecords();
  const idx = current.findIndex((item) => item.id === record.id);
  if (idx === -1) {
    writePendingRecords([...current, record]);
  } else {
    const next = [...current];
    next[idx] = record;
    writePendingRecords(next);
  }
}

function reconcilePendingRecords(
  succeededIds: Set<string>,
  attemptedIds: Set<string>,
  stillUnauthorized: boolean
) {
  const current = readPendingRecords();
  const next = current
    .filter((item) => !succeededIds.has(item.id))
    .map((item) =>
      attemptedIds.has(item.id) ? { ...item, authRequired: stillUnauthorized } : item
    );
  writePendingRecords(next);
}

function subscribePendingRecords(listener: () => void) {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

async function submitRecordPayload(payload: PendingQuizRecord['payload']): Promise<'ok' | 'unauthorized' | 'error'> {
  try {
    const res = await fetch('/api/quiz/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    if (res.ok) return 'ok';
    if (res.status === 401) return 'unauthorized';
    return 'error';
  } catch {
    return 'error';
  }
}

export default function SpellingQuizPage() {
  const searchParams = useSearchParams();
  const t = useTranslations('quizPages.spelling');
  const tc = useTranslations('quizPages.common');

  const requestedReturnTo = searchParams.get('returnTo');
  const returnTo = safeReturnPath(requestedReturnTo, '/home');
  const returnLabel = returnTo === '/home' ? tc('backToHome') : tc('backToPrevious');

  const rawSource = searchParams.get('source');
  const source =
    rawSource === 'random' ||
    rawSource === 'library' ||
    rawSource === 'unfamiliar' ||
    rawSource === 'custom' ||
    rawSource === 'due'
      ? rawSource
      : null;
  const libraryPath = searchParams.get('library');
  const rawGroupIndex = searchParams.get('groupIndex');
  const parsedGroupIndex = rawGroupIndex !== null ? parseInt(rawGroupIndex, 10) : null;
  const groupIndex = parsedGroupIndex !== null && Number.isFinite(parsedGroupIndex) ? parsedGroupIndex : null;
  const parsedGroupSize = parseInt(searchParams.get('groupSize') || '20', 10);
  const groupSize = Number.isFinite(parsedGroupSize) ? parsedGroupSize : 20;
  const parsedCount = parseInt(searchParams.get('count') || '20', 10);
  const count = Number.isFinite(parsedCount) ? parsedCount : 20;

  const { words, loading, error } = useQuizData({ source, libraryPath, groupIndex, groupSize, count });
  const [retryKey, setRetryKey] = useState(0);
  const failedRecords = useSyncExternalStore(subscribePendingRecords, readPendingRecords, () => EMPTY_PENDING);
  const [retryingSave, setRetryingSave] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const authRequired = failedRecords.some((r) => r.authRequired);

  const enqueueAndSubmitRecord = useCallback((word: string, scorePts: number, userInput: string) => {
    const submissionId = createSubmissionId();
    const pendingRecord: PendingQuizRecord = {
      id: submissionId,
      payload: {
        clientSubmissionId: submissionId,
        word,
        testType: 1,
        score: scorePts,
        userInput,
      },
    };

    // Persist on failure even if the session remounts or navigates away before response returns
    void submitRecordPayload(pendingRecord.payload).then((result) => {
      if (result === 'unauthorized') {
        upsertPendingRecord({ ...pendingRecord, authRequired: true });
      } else if (result === 'error') {
        upsertPendingRecord({ ...pendingRecord, authRequired: false });
      }
    });
  }, []);

  const handleRetryFailedSaves = useCallback(async () => {
    const snapshot = readPendingRecords();
    if (retryingSave || snapshot.length === 0) return;
    setRetryingSave(true);
    const attemptedIds = new Set(snapshot.map((item) => item.id));
    const succeededIds = new Set<string>();
    let stillUnauthorized = false;

    try {
      for (const item of snapshot) {
        if (stillUnauthorized) break;
        const result = await submitRecordPayload(item.payload);
        if (result === 'ok') {
          succeededIds.add(item.id);
        } else if (result === 'unauthorized') {
          stillUnauthorized = true;
        }
      }

      reconcilePendingRecords(succeededIds, attemptedIds, stillUnauthorized);
    } finally {
      if (mountedRef.current) {
        setRetryingSave(false);
      }
    }
  }, [retryingSave]);

  const renderSaveAlert = (compact = false) => {
    if (failedRecords.length === 0) return null;
    return (
      <div
        role="alert"
        className={`w-full rounded-2xl border text-left text-xs ${
          authRequired
            ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
            : 'bg-red-950/30 border-red-500/30 text-red-200'
        } ${compact ? 'px-4 py-2.5' : 'p-4'}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle size={15} className="shrink-0" />
            <span>
              {authRequired
                ? tc('saveAuthRequired')
                : tc('saveFailedBanner', { count: failedRecords.length })}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {authRequired && (
              <Link
                href="/login"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 font-semibold transition-colors"
              >
                {tc('loginToSave')}
              </Link>
            )}
            <button
              type="button"
              onClick={handleRetryFailedSaves}
              disabled={retryingSave}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-semibold transition-colors"
            >
              {retryingSave ? tc('retryingSave') : tc('retrySave')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"></div>
        <p className="text-xs text-neutral-400 font-mono">{t('loading')}</p>
      </div>
    );
  }

  if (error || words.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
        <AlertCircle size={36} className="text-amber-500 mx-auto" />
        <h2 className="text-lg font-bold">{error || t('noWords')}</h2>
        {failedRecords.length > 0 && (
          <div className="max-w-md w-full">{renderSaveAlert(false)}</div>
        )}
        <Link
          href={returnTo}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-semibold text-white hover:bg-neutral-800"
        >
          <ArrowLeft size={14} />
          <span>{returnLabel}</span>
        </Link>
      </div>
    );
  }

  const sessionKey = `${words.map((w) => w.word).join('\0')}|${retryKey}`;

  return (
    <SpellingQuizSession
      key={sessionKey}
      words={words}
      returnTo={returnTo}
      returnLabel={returnLabel}
      onRetryGroup={() => setRetryKey((v) => v + 1)}
      onSubmitRecord={enqueueAndSubmitRecord}
      saveAlertCompact={renderSaveAlert(true)}
      saveAlertFull={renderSaveAlert(false)}
    />
  );
}

interface SpellingQuizSessionProps {
  words: QuizWord[];
  returnTo: string;
  returnLabel: string;
  onRetryGroup: () => void;
  onSubmitRecord: (word: string, scorePts: number, userInput: string) => void;
  saveAlertCompact: React.ReactNode;
  saveAlertFull: React.ReactNode;
}

function SpellingQuizSession({
  words,
  returnTo,
  returnLabel,
  onRetryGroup,
  onSubmitRecord,
  saveAlertCompact,
  saveAlertFull,
}: SpellingQuizSessionProps) {
  const t = useTranslations('quizPages.spelling');
  const tc = useTranslations('quizPages.common');
  const { preferredAccent } = useSettings();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [score, setScore] = useState(0);
  const [hintLevel, setHintLevel] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [records, setRecords] = useState<Array<{ word: string; userInput: string; isCorrect: boolean }>>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmittedIndexRef = useRef(-1);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }
    };
  }, []);

  const currentWord: QuizWord | undefined = words[currentIndex];
  const progressPercent = words.length > 0 ? Math.round((currentIndex / words.length) * 100) : 0;

  const playAudio = useCallback((type: 'US' | 'UK' = preferredAccent === 'uk' ? 'UK' : 'US') => {
    if (!currentWord?.word) return;
    const w = currentWord.word;
    const audioType = type === 'US' ? 2 : 1;
    const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(w)}&type=${audioType}`;
    const audio = new Audio(url);
    audio.play().catch(() => {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(w);
        u.lang = type === 'UK' ? 'en-GB' : 'en-US';
        window.speechSynthesis.speak(u);
      }
    });
  }, [currentWord, preferredAccent]);

  // Focus input and play audio on word change
  useEffect(() => {
    if (currentWord && !isFinished) {
      playAudio();
      const focusTimer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(focusTimer);
    }
  }, [currentWord, currentIndex, isFinished, playAudio]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isFinished || !currentWord || feedback !== null) return;
    if (lastSubmittedIndexRef.current === currentIndex) return;
    lastSubmittedIndexRef.current = currentIndex;

    const trimmedInput = input.trim().toLowerCase();
    const targetWord = currentWord.word.trim().toLowerCase();
    const isCorrect = trimmedInput === targetWord;

    setFeedback(isCorrect ? 'correct' : 'wrong');
    if (isCorrect) setScore((s) => s + 1);

    setRecords((prev) => [
      ...prev,
      { word: currentWord.word, userInput: input.trim(), isCorrect },
    ]);

    // 看过提示才拼对只算「模糊」，不能和独立拼对一样记成掌握
    const scorePts = isCorrect ? (hintLevel > 0 ? 1 : 2) : 0;
    onSubmitRecord(currentWord.word, scorePts, input.trim());

    // Advance after brief feedback delay
    advanceTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      if (currentIndex < words.length - 1) {
        setInput('');
        setFeedback(null);
        setHintLevel(0);
        setCurrentIndex((i) => i + 1);
      } else {
        setIsFinished(true);
      }
    }, isCorrect ? 900 : 1800);
  };

  const handleShowHint = () => {
    if (!currentWord) return;
    setHintLevel((h) => Math.min(h + 1, currentWord.word.length));
    inputRef.current?.focus();
  };

  // End Screen Report
  if (isFinished) {
    const accuracyPercent = Math.round((score / words.length) * 100);
    const missedWords = records.filter((r) => !r.isCorrect);

    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="max-w-md w-full p-8 rounded-3xl bg-neutral-950 border border-neutral-800 shadow-2xl space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
            <Trophy size={32} />
          </div>

          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">{t('finishedTitle')}</h2>
            <p className="text-xs text-neutral-400 mt-1">
              {t('finishedSummary', { count: words.length })}
            </p>
          </div>

          {/* Accuracy Score */}
          <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>{t('accuracy')}</span>
              <span className="font-mono text-emerald-400 font-bold text-base">
                {score} / {words.length} ({accuracyPercent}%)
              </span>
            </div>
            <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${accuracyPercent}%` }}
              />
            </div>
          </div>

          {/* Missed Words Review if any */}
          {missedWords.length > 0 && (
            <div className="p-4 rounded-2xl bg-red-950/20 border border-red-500/20 text-left space-y-2 max-h-48 overflow-y-auto">
              <div className="text-xs font-bold text-red-400">{t('missedTitle', { count: missedWords.length })}</div>
              <div className="space-y-1">
                {missedWords.map((m, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-white font-semibold">{m.word}</span>
                    <span className="text-red-400 line-through text-[11px]">{m.userInput || t('noAnswer')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {saveAlertFull}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              type="button"
              onClick={onRetryGroup}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all"
            >
              <RotateCcw size={14} />
              <span>{tc('retryGroup')}</span>
            </button>
            <Link
              href={returnTo}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-semibold transition-all"
            >
              <ArrowLeft size={14} />
              <span>{returnLabel}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Active Spelling Question
  const definition = currentWord.chineseData?.concise_definition || t('noDefinition');
  const hintText = hintLevel > 0 ? currentWord.word.slice(0, hintLevel) : '';

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-between p-4 sm:p-8">
      {/* Top Navigation & Progress */}
      <div className="max-w-2xl w-full space-y-3">
        <div className="flex items-center justify-between gap-4 border-b border-neutral-900 pb-4">
          <Link
            href={returnTo}
            className="p-2 -ml-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent hover:border-neutral-800 transition-all group"
          >
            <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform text-neutral-300" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-400 font-mono">
              {currentIndex + 1} <span className="text-neutral-600">/</span> {words.length}
            </span>
            <div className="w-28 sm:w-36 bg-neutral-900 h-2 rounded-full overflow-hidden border border-neutral-800">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <div className="text-xs font-mono text-neutral-400">
            {t('correctLabel')} <span className="text-emerald-400 font-bold">{score}</span>
          </div>
        </div>
        {saveAlertCompact}
      </div>

      {/* Center Spelling Card */}
      <div className="max-w-xl w-full my-auto py-6 space-y-6">
        <div className="rounded-3xl p-8 bg-neutral-950/90 border border-neutral-800/90 shadow-2xl space-y-6 text-center">
          {/* Card Header & Pronunciation */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {t('cardTag')}
            </span>
            <button
              type="button"
              onClick={() => playAudio()}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 hover:text-white transition-colors"
            >
              <Volume2 size={14} className="text-emerald-400" />
              <span>{t('playAudio')}</span>
            </button>
          </div>

          {/* Chinese Definition Clue */}
          <div className="py-4 space-y-2">
            <p className="text-xl sm:text-2xl font-bold text-white leading-relaxed">
              {definition}
            </p>
            {currentWord.chineseData?.pronunciation && (
              <p className="text-xs font-mono text-neutral-500">
                /{currentWord.chineseData.pronunciation}/
              </p>
            )}
          </div>

          {/* Hint Pill if revealed */}
          {hintLevel > 0 && (
            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-400 animate-fade-in">
              <span>{t('hintLabel', { hint: hintText, count: currentWord.word.length })}</span>
            </div>
          )}

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('inputPlaceholder')}
                disabled={feedback !== null}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                className={`w-full px-5 py-4 rounded-2xl bg-neutral-900 border text-center text-xl sm:text-2xl font-mono font-bold tracking-wider outline-none transition-all ${
                  feedback === 'correct'
                    ? 'border-emerald-500 bg-emerald-950/30 text-emerald-400 shadow-lg shadow-emerald-900/20'
                    : feedback === 'wrong'
                    ? 'border-red-500 bg-red-950/30 text-red-400 shadow-lg shadow-red-900/20'
                    : 'border-neutral-700 focus:border-blue-500 text-white focus:ring-2 focus:ring-blue-500/20'
                }`}
              />

              {feedback === 'correct' && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400">
                  <Check size={24} />
                </div>
              )}
              {feedback === 'wrong' && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-red-400">
                  <XIcon size={24} />
                </div>
              )}
            </div>

            {/* Answer Display on Wrong */}
            {feedback === 'wrong' && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-center space-y-1 animate-fade-in">
                <div className="text-neutral-400">{t('correctSpellingIs')}</div>
                <div className="text-white font-mono font-bold text-lg">{currentWord.word}</div>
              </div>
            )}

            {/* Submit & Hint Controls */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleShowHint}
                disabled={feedback !== null}
                className="flex-1 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-neutral-400 hover:text-white transition-colors"
              >
                {t('hintButton')}
              </button>
              <button
                type="submit"
                disabled={!input.trim() || feedback !== null}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white text-xs font-semibold shadow-lg shadow-emerald-900/20 transition-all"
              >
                <span>{t('submitButton')}</span>
                <Send size={13} />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Bottom Shortcuts Hint */}
      <div className="max-w-2xl w-full pt-4 border-t border-neutral-900 text-center text-[11px] text-neutral-500 font-mono">
        <span>{t('bottomHint')}</span>
      </div>
    </div>
  );
}
