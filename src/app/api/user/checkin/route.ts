import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, ensureLocalUser } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await ensureLocalUser(session);

    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [quizRecords, visitRecords] = await Promise.all([
      prisma.quizRecord.findMany({
        where: { userId: session.id, timestamp: { gte: yearStart } },
        select: { word: true, score: true, timestamp: true },
      }),
      prisma.wordVisit.findMany({
        where: { userId: session.id, timestamp: { gte: yearStart } },
        select: { word: true, timestamp: true },
      }),
    ]);

    const toDateStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const toMonthStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    };

    const todayStr = toDateStr(now);

    // Today's quiz stats
    const todayQuiz = quizRecords.filter(r => toDateStr(new Date(r.timestamp)) === todayStr);
    const todayCorrect = todayQuiz.filter(r => r.score > 0).length;

    // Today's total word activity count (visits + quiz, including repeats)
    const todayVisits = visitRecords.filter(r => toDateStr(new Date(r.timestamp)) === todayStr);
    const todayWordsCount = todayVisits.length + todayQuiz.length;

    // Streak: consecutive days with any activity (quiz or visit)
    const allDates = new Set([
      ...quizRecords.map(r => toDateStr(new Date(r.timestamp))),
      ...visitRecords.map(r => toDateStr(new Date(r.timestamp))),
    ]);
    let streak = 0;
    const checkDate = new Date(now);
    while (true) {
      if (allDates.has(toDateStr(checkDate))) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // Monthly: current month, each day's total activity count (quiz + visit, including repeats)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyMap: Record<string, number> = {};
    [...quizRecords, ...visitRecords]
      .filter(r => new Date(r.timestamp) >= monthStart)
      .forEach(r => {
        const d = toDateStr(new Date(r.timestamp));
        monthlyMap[d] = (monthlyMap[d] || 0) + 1;
      });
    const monthly = Object.entries(monthlyMap).map(([date, count]) => ({ date, count }));

    // Weekly: last 7 days (including today), each day's total activity count
    const weeklyMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      weeklyMap[toDateStr(d)] = 0;
    }
    [...quizRecords, ...visitRecords].forEach(r => {
      const d = toDateStr(new Date(r.timestamp));
      if (d in weeklyMap) weeklyMap[d]++;
    });
    const weekly = Object.entries(weeklyMap).map(([date, count]) => ({ date, count }));

    return NextResponse.json({
      today: {
        date: todayStr,
        wordsStudied: todayWordsCount,
        quizCount: todayQuiz.length,
        correctRate: todayQuiz.length > 0 ? Math.round((todayCorrect / todayQuiz.length) * 100) : 0,
      },
      streak,
      monthly,
      weekly,
    });
  } catch (error) {
    console.error('Checkin fetch error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
