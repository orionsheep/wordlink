'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, Activity, Trophy, Target, Calendar } from 'lucide-react';
import { useDeviceType } from '@/lib/hooks/useMediaQuery';
import { useForceMobileLayout } from '@/lib/hooks';
import { useTranslations } from 'next-intl';

const MobileLayout = dynamic(() => import('@/components/mobile/MobileLayout'), { ssr: false });

interface WordStat {
    word: string;
    masteryLevel: number;
    history: { date: string; score: number }[];
}

interface CheckinData {
    today: {
        date: string;
        wordsStudied: number;
        quizCount: number;
        correctRate: number;
    };
    streak: number;
    monthly: { date: string; count: number }[];
    weekly: { date: string; count: number }[];
}

import { useSettings } from '@/context/SettingsContext';

export default function DashboardPage() {
    const { groupSize, dashboardPageSize, updateSettings } = useSettings();
    const deviceType = useDeviceType();
    const forceMobileLayout = useForceMobileLayout();
    const isMobile = deviceType === 'mobile' || forceMobileLayout;
    const t = useTranslations();
    const [stats, setStats] = useState<WordStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [checkinData, setCheckinData] = useState<CheckinData | null>(null);

    // Filter State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Group Filter State
    const [libraries, setLibraries] = useState<{ name: string, path: string, type: string }[]>([]);
    const [selectedLibrary, setSelectedLibrary] = useState('');
    const [groups, setGroups] = useState<{ index: number, label: string }[]>([]);
    const [selectedGroupIndex, setSelectedGroupIndex] = useState<number>(-1);
    const [sortBy, setSortBy] = useState<'default' | 'date' | 'mastery_asc' | 'mastery_desc'>('mastery_asc');


    // Fetch libraries on mount
    useEffect(() => {
        fetch('/api/libraries')
            .then(res => {
                if (res.ok) return res.json();
                throw new Error('Failed to fetch libraries');
            })
            .then(data => {
                setLibraries(data.filter((item: any) => item.type === 'file'));
            })
            .catch(err => {
                console.error('Failed to fetch libraries:', err);
            });
    }, []);

    // Fetch groups when library changes
    useEffect(() => {
        if (selectedLibrary) {
            fetch(`/api/library-groups?path=${encodeURIComponent(selectedLibrary)}&groupSize=${groupSize}`)
                .then(res => {
                    if (res.ok) return res.json();
                    throw new Error('Failed to fetch groups');
                })
                .then(data => {
                    setGroups(data);
                    setSelectedGroupIndex(-1);
                })
                .catch(err => {
                    console.error('Failed to fetch groups:', err);
                });
        } else {
            setGroups([]);
        }
    }, [selectedLibrary, groupSize]);

    // Fetch check-in data
    const fetchCheckinData = async () => {
        try {
            const response = await fetch('/api/user/checkin', {
                credentials: 'include'
            });
            if (response.ok) {
                const data = await response.json();
                setCheckinData(data);
            }
        } catch (error) {
            console.error('Failed to fetch checkin data:', error);
        }
    };

    const fetchStats = async () => {
        setLoading(true);
        const params = new URLSearchParams();

        let groupWords: string[] = [];

        // If group is selected, fetch words first
        if (selectedGroupIndex !== -1 && selectedLibrary) {
            try {
                const wordsRes = await fetch(`/api/library-words?path=${encodeURIComponent(selectedLibrary)}&groupIndex=${selectedGroupIndex}&groupSize=${groupSize}`);
                const words = await wordsRes.json();
                // API returns array of strings
                groupWords = words;
                const wordList = words.join(',');
                params.append('words', wordList);
            } catch (e) {
                console.error('Failed to fetch group words', e);
            }
        }

        fetch(`/api/user/stats?${params.toString()}`, {
            credentials: 'include'
        })
            .then(res => {
                if (res.ok) return res.json();
                throw new Error('Failed to fetch stats');
            })
            .then(data => {
                if (data.stats) {
                    let finalStats = data.stats;

                    // If we have a specific group selected, ensure all words in the group are shown
                    if (groupWords.length > 0) {
                        const statsMap = new Map(data.stats.map((s: any) => [s.word, s]));
                        finalStats = groupWords.map(word => {
                            return statsMap.get(word) || {
                                word: word,
                                masteryLevel: 0,
                                spellingScore: 0,
                                recallScore: 0,
                                history: []
                            };
                        });
                    }

                    setStats(finalStats);
                }
                setError(null);
            })
            .catch(err => {
                console.error(err);
                setError('Failed to load dashboard data. Please make sure you are logged in.');
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchStats();
        fetchCheckinData();
    }, []);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = dashboardPageSize || 20;

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [startDate, endDate, selectedLibrary, selectedGroupIndex, sortBy]);

    if (loading) return <div className="h-screen bg-black text-white flex items-center justify-center">{t('dashboard.loading')}</div>;

    const totalWords = stats.length;
    const masteredWords = stats.filter(s => s.masteryLevel === 4).length;
    const learningWords = stats.filter(s => s.masteryLevel > 0 && s.masteryLevel < 4).length;

    // Sort words
    const sortedStats = [...stats].sort((a, b) => {
        if (sortBy === 'default') return 0;
        if (sortBy === 'date') {
            const lastA = a.history[a.history.length - 1]?.date || '';
            const lastB = b.history[b.history.length - 1]?.date || '';
            return lastB.localeCompare(lastA);
        } else if (sortBy === 'mastery_asc') {
            return a.masteryLevel - b.masteryLevel;
        } else if (sortBy === 'mastery_desc') {
            return b.masteryLevel - a.masteryLevel;
        }
        return 0;
    });

    const totalPages = Math.ceil(sortedStats.length / itemsPerPage);
    const paginatedStats = sortedStats.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Get date range for the chart
    let dates: string[] = [];
    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(d.toISOString().split('T')[0]);
        }
    } else {
        // Default to last 7 days on mobile, 14 on desktop
        const dayCount = isMobile ? 7 : 14;
        dates = Array.from({ length: dayCount }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toISOString().split('T')[0];
        }).reverse();
    }

    const content = (
        <div className={`min-h-screen bg-black text-white ${isMobile ? 'pb-24 overflow-x-hidden' : 'p-4 sm:p-6 md:p-8'}`}>{/* existing content */}

            <div className={`max-w-6xl mx-auto ${isMobile ? 'px-4 w-full' : ''}`}>
                {/* Today's Check-in Card */}
                {checkinData && (() => {
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = now.getMonth();
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
                        const d = String(i + 1).padStart(2, '0');
                        const m = String(month + 1).padStart(2, '0');
                        return `${year}-${m}-${d}`;
                    });
                    const monthMap = Object.fromEntries(checkinData.monthly.map(x => [x.date, x.count]));
                    const maxMonthCount = Math.max(1, ...checkinData.monthly.map(x => x.count));
                    const maxWeekCount = Math.max(1, ...checkinData.weekly.map(x => x.count));
                    const offset = (new Date(year, month, 1).getDay() + 6) % 7;

                    return (
                        <div className="bg-neutral-950 border border-neutral-800 rounded-xl mb-6">
                            {/* Header */}
                            <div className="px-4 py-3 flex items-center justify-between border-b border-neutral-800">
                                <span className="text-xs text-neutral-500">
                                    {now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })} 学习打卡
                                </span>
                                {checkinData.streak > 0 && (
                                    <span className="text-xs text-neutral-400">🔥 连续 {checkinData.streak} 天</span>
                                )}
                            </div>

                            {/* Stats row */}
                            <div className="grid grid-cols-3 divide-x divide-neutral-800 border-b border-neutral-800">
                                {[
                                    { value: checkinData.today.wordsStudied, label: '今日单词' },
                                    { value: checkinData.today.quizCount, label: '测验次数' },
                                    { value: `${checkinData.today.correctRate}%`, label: '正确率' },
                                ].map(({ value, label }) => (
                                    <div key={label} className="py-4 text-center">
                                        <div className="text-2xl font-semibold text-white">{value}</div>
                                        <div className="text-[11px] text-neutral-500 mt-0.5">{label}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Calendar + Weekly side by side */}
                            <div className={`flex ${isMobile ? 'flex-col divide-y divide-neutral-800' : 'divide-x divide-neutral-800'}`}>
                                {/* Monthly calendar */}
                                <div className="p-4">
                                    <div className="text-[11px] text-neutral-500 mb-2">本月</div>
                                    {isMobile ? (
                                        // Mobile: fill full width
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                                            {['一','二','三','四','五','六','日'].map(d => (
                                                <div key={d} className="flex items-center justify-center text-[10px] text-neutral-600" style={{ height: 20 }}>{d}</div>
                                            ))}
                                            {Array.from({ length: offset }, (_, i) => (
                                                <div key={`e-${i}`} style={{ height: 36 }} />
                                            ))}
                                            {monthDays.map(date => {
                                                const count = monthMap[date] || 0;
                                                const intensity = count === 0 ? 0 : Math.min(4, Math.ceil((count / maxMonthCount) * 4));
                                                const bg = ['#1a1a1a', '#052e16', '#14532d', '#166534', '#16a34a'][intensity];
                                                const isToday = date === checkinData.today.date;
                                                const day = parseInt(date.split('-')[2]);
                                                return (
                                                    <div
                                                        key={date}
                                                        title={`${date}: ${count} 词`}
                                                        style={{ height: 36, background: bg, borderRadius: 6, outline: isToday ? '1px solid rgba(255,255,255,0.3)' : 'none' }}
                                                        className="flex items-center justify-center"
                                                    >
                                                        <span style={{ fontSize: 11, color: count > 0 ? 'rgba(255,255,255,0.7)' : '#404040' }}>{day}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        // Desktop: fixed 26px cells
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 26px)', gap: '3px' }}>
                                            {['一','二','三','四','五','六','日'].map(d => (
                                                <div key={d} style={{ width: 26, height: 18 }} className="flex items-center justify-center text-[9px] text-neutral-600">{d}</div>
                                            ))}
                                            {Array.from({ length: offset }, (_, i) => (
                                                <div key={`e-${i}`} style={{ width: 26, height: 26 }} />
                                            ))}
                                            {monthDays.map(date => {
                                                const count = monthMap[date] || 0;
                                                const intensity = count === 0 ? 0 : Math.min(4, Math.ceil((count / maxMonthCount) * 4));
                                                const bg = ['#1a1a1a', '#052e16', '#14532d', '#166534', '#16a34a'][intensity];
                                                const isToday = date === checkinData.today.date;
                                                const day = parseInt(date.split('-')[2]);
                                                return (
                                                    <div
                                                        key={date}
                                                        title={`${date}: ${count} 词`}
                                                        style={{ width: 26, height: 26, background: bg, borderRadius: 4, outline: isToday ? '1px solid rgba(255,255,255,0.3)' : 'none' }}
                                                        className="flex items-center justify-center"
                                                    >
                                                        <span style={{ fontSize: 10, color: count > 0 ? 'rgba(255,255,255,0.7)' : '#404040' }}>{day}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Weekly bars */}
                                <div className={`p-4 ${isMobile ? '' : 'flex-1 flex flex-col'}`}>
                                    <div className="text-[11px] text-neutral-500 mb-2">近7天</div>
                                    <div
                                        className="flex items-end gap-2"
                                        style={isMobile ? { height: 120 } : { flex: 1 }}
                                    >
                                        {checkinData.weekly.map(({ date, count }) => {
                                            const pct = count === 0 ? 2 : Math.max(8, Math.round((count / maxWeekCount) * 100));
                                            const isToday = date === checkinData.today.date;
                                            const dayLabel = String(parseInt(date.split('-')[2]));
                                            return (
                                                <div key={date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                                                    <div className="w-full flex items-end" style={{ height: `${pct}%` }}>
                                                        <div
                                                            title={`${date}: ${count} 词`}
                                                            style={{ height: '100%', width: '100%', borderRadius: 3, background: isToday ? '#e5e5e5' : count > 0 ? '#525252' : '#262626' }}
                                                        />
                                                    </div>
                                                    <span style={{ fontSize: 10, color: isToday ? '#a3a3a3' : '#525252' }}>{dayLabel}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Header */}
                <div className="flex items-center justify-between mb-6 md:mb-8">
                    <div className="flex items-center gap-3 sm:gap-4">
                        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
                            {t('dashboard.title')}
                        </h1>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 mb-6 md:mb-8 flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-end">
                        <div className="flex-1 min-w-0 shrink">
                            <label className="block text-xs text-neutral-500 mb-1">{t('dashboard.startDate')}</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className={`w-full max-w-full bg-neutral-900 border border-neutral-700 rounded-lg ${isMobile ? 'px-2 py-2 text-xs' : 'px-3 py-2 text-sm'} min-h-[48px] focus:border-blue-500 outline-none text-white [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-date-and-time-value]:text-left`}
                                style={{ colorScheme: 'dark', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none' }}
                            />
                        </div>
                        <div className="flex-1 min-w-0 shrink">
                            <label className="block text-xs text-neutral-500 mb-1">{t('dashboard.endDate')}</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className={`w-full max-w-full bg-neutral-900 border border-neutral-700 rounded-lg ${isMobile ? 'px-2 py-2 text-xs' : 'px-3 py-2 text-sm'} min-h-[48px] focus:border-blue-500 outline-none text-white [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-date-and-time-value]:text-left`}
                                style={{ colorScheme: 'dark', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none' }}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-end border-t border-neutral-800 pt-4">
                        <div className="flex-1">
                            <label className="block text-xs text-neutral-500 mb-1">{t('dashboard.libraryOptional')}</label>
                            <select
                                value={selectedLibrary}
                                onChange={(e) => setSelectedLibrary(e.target.value)}
                                className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 min-h-[48px] text-sm focus:border-blue-500 outline-none"
                            >
                                <option value="">{t('dashboard.selectLibrary')}</option>
                                {libraries.map(lib => (
                                    <option key={lib.path} value={lib.path}>{lib.name.replace('.csv', '')}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs text-neutral-500 mb-1">{t('dashboard.groupOptional')}</label>
                            <select
                                value={selectedGroupIndex}
                                onChange={(e) => setSelectedGroupIndex(Number(e.target.value))}
                                className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 min-h-[48px] text-sm focus:border-blue-500 outline-none"
                                disabled={!selectedLibrary}
                            >
                                <option value={-1}>{t('dashboard.selectGroup')}</option>
                                {groups.map(g => (
                                    <option key={g.index} value={g.index}>{g.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs text-neutral-500 mb-1">{t('dashboard.sortBy')}</label>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as any)}
                                className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 min-h-[48px] text-sm focus:border-blue-500 outline-none text-white"
                            >
                                <option value="default">{t('dashboard.defaultOrder')}</option>
                                <option value="mastery_asc">{t('dashboard.familiarityLowToHigh')}</option>
                                <option value="mastery_desc">{t('dashboard.familiarityHighToLow')}</option>
                                <option value="date">{t('dashboard.lastStudiedDate')}</option>
                            </select>
                        </div>
                        <button
                            onClick={fetchStats}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 min-h-[48px] rounded-lg text-sm font-medium transition-colors active:bg-blue-400 w-full sm:w-auto"
                        >
                            {t('dashboard.filter')}
                        </button>
                    </div>
                </div>

                {/* Stats Cards */}
                {error && (
                    <div className="text-red-500 text-center p-4 mb-8 bg-red-500/10 border border-red-500/20 rounded-xl">
                        {error}
                    </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-8 md:mb-12">
                    <div className="bg-neutral-900/50 border border-neutral-800 p-4 sm:p-6 rounded-2xl">
                        <div className="flex items-center gap-3 mb-2 text-blue-500">
                            <Target size={24} />
                            <span className="font-semibold uppercase tracking-wider text-sm">{t('dashboard.totalWords')}</span>
                        </div>
                        <div className="text-3xl sm:text-4xl font-bold">{totalWords}</div>
                    </div>
                    <div className="bg-neutral-900/50 border border-neutral-800 p-4 sm:p-6 rounded-2xl">
                        <div className="flex items-center gap-3 mb-2 text-green-500">
                            <Trophy size={24} />
                            <span className="font-semibold uppercase tracking-wider text-sm">{t('dashboard.mastered')}</span>
                        </div>
                        <div className="text-3xl sm:text-4xl font-bold">{masteredWords}</div>
                    </div>
                    <div className="bg-neutral-900/50 border border-neutral-800 p-4 sm:p-6 rounded-2xl sm:col-span-2 md:col-span-1">
                        <div className="flex items-center gap-3 mb-2 text-yellow-500">
                            <Activity size={24} />
                            <span className="font-semibold uppercase tracking-wider text-sm">{t('dashboard.inProgress')}</span>
                        </div>
                        <div className="text-3xl sm:text-4xl font-bold">{learningWords}</div>
                    </div>
                </div>

                {/* Mastery Chart */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 overflow-x-auto -mx-4 sm:mx-0 rounded-none sm:rounded-2xl border-x-0 sm:border-x">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-2">
                        <h2 className="text-lg sm:text-xl font-bold">{t('dashboard.masteryTimeline', { days: isMobile ? 7 : 14 })}</h2>
                        <div className="text-sm text-neutral-500">
                            {t('dashboard.pageInfo', { current: currentPage, total: totalPages || 1 })}
                        </div>
                    </div>

                    <div>
                        {/* Date Header */}
                        <div className={`flex mb-2 ${isMobile ? 'ml-20' : 'ml-32'}`}>
                            {dates.map(date => (
                                <div key={date} className={`${isMobile ? 'w-10' : 'w-16'} flex-shrink-0 text-xs text-neutral-500 text-center -rotate-45 origin-bottom-left translate-y-2`}>
                                    {date.slice(5)}
                                </div>
                            ))}
                        </div>

                        {/* Rows */}
                        <div className="space-y-1 mt-8">
                            {paginatedStats.map(stat => (
                                <div key={stat.word} className="flex items-center h-8 hover:bg-neutral-800/50 rounded transition-colors">
                                    <div className={`${isMobile ? 'w-20 text-xs' : 'w-32 text-sm'} font-medium text-neutral-300 truncate pr-2 text-right`}>
                                        {stat.word}
                                    </div>
                                    <div className="flex gap-1 h-full items-center">
                                        {dates.map(date => {
                                            // Find score for this date
                                            const activity = stat.history.find(h => h.date.startsWith(date));
                                            const score = activity ? activity.score : 0;

                                            // Determine color based on score
                                            let color = 'bg-neutral-800';
                                            if (score === 1) color = 'bg-red-500/50';
                                            if (score === 2) color = 'bg-yellow-500/50';
                                            if (score === 3) color = 'bg-blue-500/50';
                                            if (score === 4) color = 'bg-green-500';

                                            return (
                                                <div
                                                    key={date}
                                                    className={`${isMobile ? 'w-10' : 'w-16'} flex-shrink-0 h-6 rounded-sm ${activity ? color : 'bg-neutral-800/30'}`}
                                                    title={`${stat.word} on ${date}: Score ${score}`}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination & Display Controls */}
                        <div className="flex flex-col gap-4 mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-neutral-800">
                            <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400">
                                <span>{t('dashboard.show')}</span>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="1"
                                        max="500"
                                        value={dashboardPageSize}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val > 0) {
                                                updateSettings({ dashboardPageSize: val });
                                            }
                                        }}
                                        className="w-16 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 min-h-[40px] text-white text-center focus:outline-none focus:border-blue-500 appearance-none"
                                    />
                                </div>
                                <span>{t('dashboard.perPage')}</span>

                                <div className="flex gap-1 sm:ml-2 sm:border-l sm:border-neutral-800 sm:pl-3">
                                    {[10, 20, 50, 100].map(size => (
                                        <button
                                            key={size}
                                            onClick={() => updateSettings({ dashboardPageSize: size })}
                                            className={`px-2 py-1 min-h-[36px] min-w-[36px] rounded text-xs transition-colors ${dashboardPageSize === size ? 'bg-blue-600 text-white' : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'}`}
                                        >
                                            {size}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {totalPages > 1 && (
                                <div className="flex items-center justify-center sm:justify-end gap-3 sm:gap-4">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="px-4 py-2 min-h-[48px] bg-neutral-800 rounded-lg text-sm hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {t('dashboard.previous')}
                                    </button>
                                    <span className="text-sm text-neutral-400">
                                        {t('dashboard.pageInfo', { current: currentPage, total: totalPages })}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-4 py-2 min-h-[48px] bg-neutral-800 rounded-lg text-sm hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {t('dashboard.next')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Legend */}
                <div className="mt-6 flex flex-wrap gap-4 sm:gap-6 justify-center text-xs sm:text-sm text-neutral-400">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500/50 rounded-sm"></div> {t('dashboard.level1')}</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-yellow-500/50 rounded-sm"></div> {t('dashboard.level2')}</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500/50 rounded-sm"></div> {t('dashboard.level3')}</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-sm"></div> {t('dashboard.level4')}</div>
                </div>
            </div>
        </div>
    );

    if (isMobile) {
        return <MobileLayout>{content}</MobileLayout>;
    }

    return content;
}
