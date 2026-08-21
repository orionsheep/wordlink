'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Volume2, RotateCcw, Check, X as XIcon, HelpCircle, Trophy, AlertCircle, Sparkles, Send } from 'lucide-react';
import Link from 'next/link';
import { useQuizData, type QuizWord } from '@/hooks/useQuizData';
import { useSettings } from '@/context/SettingsContext';

export default function SpellingQuizPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const source = searchParams.get('source') as any;
  const libraryPath = searchParams.get('library');
  const groupIndex = searchParams.get('groupIndex') ? parseInt(searchParams.get('groupIndex')!) : null;
  const groupSize = searchParams.get('groupSize') ? parseInt(searchParams.get('groupSize')!) : 20;
  const count = searchParams.get('count') ? parseInt(searchParams.get('count')!) : 20;

  const { words, loading, error } = useQuizData({ source, libraryPath, groupIndex, groupSize, count });
  const { preferredAccent } = useSettings();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [score, setScore] = useState(0);
  const [hintLevel, setHintLevel] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [records, setRecords] = useState<Array<{ word: string; userInput: string; isCorrect: boolean }>>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const currentWord: QuizWord | undefined = words[currentIndex];
  const progressPercent = words.length > 0 ? Math.round(((currentIndex) / words.length) * 100) : 0;

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
      setInput('');
      setFeedback(null);
      setHintLevel(0);
      playAudio();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [currentIndex, isFinished, playAudio]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentWord || feedback !== null) return;

    const trimmedInput = input.trim().toLowerCase();
    const targetWord = currentWord.word.trim().toLowerCase();
    const isCorrect = trimmedInput === targetWord;

    setFeedback(isCorrect ? 'correct' : 'wrong');
    if (isCorrect) setScore((s) => s + 1);

    setRecords((prev) => [
      ...prev,
      { word: currentWord.word, userInput: input.trim(), isCorrect },
    ]);

    // Backend telemetry record
    fetch('/api/quiz/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: currentWord.word,
        testType: 1,
        score: isCorrect ? 2 : 0,
        userInput: input.trim(),
        isCorrect,
      }),
      credentials: 'include',
    }).catch(() => {});

    // Advance after brief feedback delay
    setTimeout(() => {
      if (currentIndex < words.length - 1) {
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

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"></div>
        <p className="text-xs text-neutral-400 font-mono">正在生成拼写题库...</p>
      </div>
    );
  }

  if (error || words.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
        <AlertCircle size={36} className="text-amber-500 mx-auto" />
        <h2 className="text-lg font-bold">{error || '暂无拼写测验单词'}</h2>
        <Link
          href="/quiz"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-semibold text-white hover:bg-neutral-800"
        >
          <ArrowLeft size={14} />
          <span>返回测验菜单</span>
        </Link>
      </div>
    );
  }

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
            <h2 className="text-2xl font-extrabold text-white tracking-tight">拼写测验完成！</h2>
            <p className="text-xs text-neutral-400 mt-1">
              本次共完成 {words.length} 个单词的听写拼写测试
            </p>
          </div>

          {/* Accuracy Score */}
          <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>正确率</span>
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
              <div className="text-xs font-bold text-red-400">需要重点巩固的生词 ({missedWords.length}):</div>
              <div className="space-y-1">
                {missedWords.map((m, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-white font-semibold">{m.word}</span>
                    <span className="text-red-400 line-through text-[11px]">{m.userInput || '(未作答)'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              onClick={() => {
                setCurrentIndex(0);
                setScore(0);
                setIsFinished(false);
                setRecords([]);
              }}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all"
            >
              <RotateCcw size={14} />
              <span>重新测验本组</span>
            </button>
            <Link
              href="/quiz"
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-semibold transition-all"
            >
              <ArrowLeft size={14} />
              <span>返回测验菜单</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Active Spelling Question
  const definition = currentWord.chineseData?.concise_definition || '暂无释义';
  const hintText = hintLevel > 0 ? currentWord.word.slice(0, hintLevel) : '';

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-between p-4 sm:p-8">
      {/* Top Navigation & Progress */}
      <div className="max-w-2xl w-full flex items-center justify-between gap-4 border-b border-neutral-900 pb-4">
        <Link
          href="/quiz"
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
          正确: <span className="text-emerald-400 font-bold">{score}</span>
        </div>
      </div>

      {/* Center Spelling Card */}
      <div className="max-w-xl w-full my-auto py-6 space-y-6">
        <div className="rounded-3xl p-8 bg-neutral-950/90 border border-neutral-800/90 shadow-2xl space-y-6 text-center">
          {/* Card Header & Pronunciation */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              拼写听写
            </span>
            <button
              type="button"
              onClick={() => playAudio()}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 hover:text-white transition-colors"
            >
              <Volume2 size={14} className="text-emerald-400" />
              <span>播放音频</span>
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
              <span>提示: {hintText}... ({currentWord.word.length} 字母)</span>
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
                placeholder="在此输入单词拼写并回车..."
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
                <div className="text-neutral-400">正确拼写为：</div>
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
                💡 获取字母提示
              </button>
              <button
                type="submit"
                disabled={!input.trim() || feedback !== null}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white text-xs font-semibold shadow-lg shadow-emerald-900/20 transition-all"
              >
                <span>提交答案</span>
                <Send size={13} />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Bottom Shortcuts Hint */}
      <div className="max-w-2xl w-full pt-4 border-t border-neutral-900 text-center text-[11px] text-neutral-500 font-mono">
        <span>输入单词后按 [Enter] 快速提交 · 点击提示可获取首字母</span>
      </div>
    </div>
  );
}
