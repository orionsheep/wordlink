/**
 * Inject 6 months of realistic demo learning data into a test account.
 *
 * Account: demo@wordlink.test / Demo2026!
 *
 * Usage: npx tsx scripts/inject-demo-data.ts
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// ---- load .env -------------------------------------------------------------
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
}

const prisma = new PrismaClient();

const ACCOUNT = {
    email: 'demo@wordlink.test',
    password: 'Demo2026!',
    nickname: 'Demo Scholar',
};
const APP_URL = 'http://localhost:3022';
const DAYS = 180;

// deterministic RNG so re-runs produce identical data
function mulberry32(seed: number) {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rand = mulberry32(20261126);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

// ~120 academic words, ordered roughly easy -> hard (introduction order)
const WORDS = [
    'adapt', 'achieve', 'benefit', 'create', 'decide', 'effect', 'focus', 'goal',
    'habit', 'idea', 'join', 'keep', 'learn', 'method', 'notice', 'offer',
    'plan', 'quality', 'reach', 'skill', 'trust', 'useful', 'value', 'willing',
    'analysis', 'approach', 'brief', 'concept', 'data', 'economy', 'factor', 'global',
    'impact', 'issue', 'labour', 'media', 'network', 'objective', 'policy', 'region',
    'strategy', 'structure', 'theory', 'unique', 'vary', 'welfare', 'access', 'available',
    'community', 'complex', 'considerable', 'distribute', 'environment', 'establish', 'finance', 'generate',
    'identify', 'individual', 'journal', 'labour2'.replace('2', ''), 'major', 'natural', 'obtain', 'perceive',
    'require', 'significant', 'transfer', 'visual', 'abandon', 'abstract', 'academic', 'accumulate',
    'acquire', 'adjust', 'alternative', 'anticipate', 'apparent', 'attribute', 'capacity', 'challenge',
    'circumstance', 'collaborate', 'commodity', 'comprehensive', 'compromise', 'concentrate', 'conflict', 'consequence',
    'contribute', 'convention', 'convince', 'crucial', 'cultivate', 'demonstrate', 'diverse', 'domain',
    'eliminate', 'emphasis', 'ensure', 'evaluate', 'eventually', 'evident', 'evolve', 'exceed',
    'facilitate', 'flexible', 'foundation', 'framework', 'fundamental', 'genuine', 'hierarchy', 'identical',
    'implement', 'infer', 'innovation', 'integrate', 'interpret', 'intrinsic', 'justify', 'mechanism',
    'modify', 'negotiate', 'ongoing', 'phenomenon', 'potential', 'prevail', 'prioritize', 'reluctant',
    'rigorous', 'sustain', 'transform', 'ubiquitous', 'versatile', 'vulnerable',
].filter((w, i, arr) => arr.indexOf(w) === i);

interface QuizEvent { word: string; score: number; timestamp: Date }
interface VisitEvent { word: string; dwellTimeMs: number; audioPlays: number; timestamp: Date }

async function ensureAccount(): Promise<string> {
    // already registered?
    const existing = await prisma.user.findUnique({ where: { email: ACCOUNT.email } });
    if (existing) {
        console.log(`账号已存在: ${ACCOUNT.email} (${existing.id})`);
        // make sure auth user is confirmed
        await prisma.$executeRawUnsafe(
            `UPDATE auth.users SET email_confirmed_at = now() WHERE email = $1`,
            ACCOUNT.email
        );
        return existing.id;
    }

    const res = await fetch(`${APP_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ACCOUNT.email, password: ACCOUNT.password }),
    });
    const json = await res.json();
    if (!json?.user?.id) throw new Error(`注册失败: ${JSON.stringify(json).slice(0, 200)}`);
    const userId: string = json.user.id;

    await prisma.$executeRawUnsafe(
        `UPDATE auth.users SET email_confirmed_at = now(), updated_at = now() WHERE email = $1`,
        ACCOUNT.email
    );
    await prisma.user.update({ where: { id: userId }, data: { nickname: ACCOUNT.nickname } });
    console.log(`账号已创建并确认: ${ACCOUNT.email} (${userId})`);
    return userId;
}

function generateHistory(): { quizzes: QuizEvent[]; visits: VisitEvent[] } {
    const quizzes: QuizEvent[] = [];
    const visits: VisitEvent[] = [];
    const knownWords: string[] = [];       // words introduced so far
    const encounterCount = new Map<string, number>();
    let wordCursor = 0;

    const today = new Date();
    today.setHours(21, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - DAYS);

    for (let d = 0; d <= DAYS; d++) {
        const date = new Date(start);
        date.setDate(date.getDate() + d);

        // activity probability grows over time (learner gets hooked); last 3 days forced (streak)
        const activeProb = 0.5 + (d / DAYS) * 0.35;
        const isActive = d >= DAYS - 3 || rand() < activeProb;
        if (!isActive) continue;

        // introduce new words: faster at the start, steadier later
        const weekIndex = Math.floor(d / 7);
        const newWordsToday = knownWords.length < 10 ? 4 : randInt(1, 3) + (weekIndex % 2);
        for (let n = 0; n < newWordsToday && wordCursor < WORDS.length; n++) {
            const w = WORDS[wordCursor++];
            knownWords.push(w);
            encounters: {
                visits.push({
                    word: w,
                    dwellTimeMs: randInt(25, 120) * 1000,
                    audioPlays: randInt(0, 4),
                    timestamp: new Date(date.getTime() + randInt(8, 22) * 3600 * 1000),
                });
            }
        }

        // quiz session: review a sample of known words, biased to recent & weak
        const sessionSize = randInt(6, 16);
        const dayBase = new Date(date.getTime() + randInt(9, 22) * 3600 * 1000);
        const pool = [...knownWords];
        for (let q = 0; q < sessionSize && pool.length > 0; q++) {
            // bias: 60% pick from the most recent 30 words, 40% from everything
            const word = rand() < 0.6 && knownWords.length > 5
                ? knownWords[knownWords.length - 1 - randInt(0, Math.min(29, knownWords.length - 1))]
                : pick(pool);
            const idx = pool.indexOf(word);
            if (idx >= 0) pool.splice(idx, 1);

            const k = encounterCount.get(word) || 0;
            encounterCount.set(word, k + 1);

            // correctness grows with repetitions and with calendar time (real growth curve)
            const baseCorrect = 0.42 + Math.min(0.28, k * 0.11) + (d / DAYS) * 0.22;
            const r = rand();
            let score: number;
            if (r < baseCorrect) score = 2;
            else if (r < baseCorrect + 0.12) score = 1;
            else score = 0;

            quizzes.push({
                word,
                score,
                timestamp: new Date(dayBase.getTime() + q * randInt(20, 90) * 1000),
            });
        }

        // some extra browsing without quizzing
        if (rand() < 0.5 && knownWords.length > 0) {
            const w = pick(knownWords);
            visits.push({
                word: w,
                dwellTimeMs: randInt(15, 200) * 1000,
                audioPlays: randInt(0, 5),
                timestamp: new Date(date.getTime() + randInt(8, 23) * 3600 * 1000),
            });
        }
    }
    return { quizzes, visits };
}

async function main() {
    console.log('=== WordLink 半年演示数据注入 ===\n');
    const userId = await ensureAccount();

    // clean previous demo data for idempotent re-runs
    await prisma.quizRecord.deleteMany({ where: { userId } });
    await prisma.wordVisit.deleteMany({ where: { userId } });
    await prisma.userWordState.deleteMany({ where: { userId } });
    await prisma.chat_sessions.deleteMany({ where: { userId } });
    await prisma.word_notes.deleteMany({ where: { userId } });

    const { quizzes, visits } = generateHistory();
    console.log(`生成事件: ${quizzes.length} 条测验, ${visits.length} 次浏览`);

    // ---- insert quiz records ----
    await prisma.quizRecord.createMany({
        data: quizzes.map((q) => ({
            id: crypto.randomUUID(),
            userId,
            word: q.word,
            testType: rand() < 0.75 ? 1 : 2,
            score: q.score,
            isCorrect: q.score > 0,
            timeSpentMs: randInt(3, 30) * 1000,
            timestamp: q.timestamp,
        })),
    });

    // ---- insert visits ----
    await prisma.wordVisit.createMany({
        data: visits.map((v) => ({
            id: crypto.randomUUID(),
            userId,
            word: v.word,
            source: 'immersive',
            dwellTimeMs: v.dwellTimeMs,
            audioPlays: v.audioPlays,
            timestamp: v.timestamp,
        })),
    });

    // ---- replay memory state machine per word (chronological) ----
    const byWord = new Map<string, QuizEvent[]>();
    for (const q of quizzes) {
        const list = byWord.get(q.word) || [];
        list.push(q);
        byWord.set(q.word, list);
    }

    // inline mirror of src/lib/memory.ts (script runs outside Next)
    function nextMemoryState(prev: any, score: number) {
        const strength = prev?.memoryStrength ?? 0;
        const stability = prev?.stability ?? 1;
        const rep = prev?.repetitionCount ?? 0;
        const cr = prev?.consecutiveRight ?? 0;
        const wc = prev?.wrongCount ?? 0;
        const r1 = (n: number) => Math.round(n * 10) / 10;
        if (score >= 2) {
            const nc = cr + 1;
            const ns = Math.min(180, stability * 1.6 + 0.4);
            const nstr = Math.min(10, strength + (nc >= 3 ? 1.5 : 1));
            return {
                stage: nc >= 6 ? 'MASTERED' : nc >= 3 ? 'LEARNED' : nc >= 1 ? 'FAMILIAR' : 'UNFAMILIAR',
                memoryStrength: r1(nstr), stability: r1(ns),
                repetitionCount: rep + 1, consecutiveRight: nc, wrongCount: wc,
                nextReviewAt: new Date(Date.now() + ns * 86400000), lastTestedAt: undefined as Date | undefined,
            };
        }
        if (score === 1) {
            const nc = cr + 1;
            return {
                stage: nc >= 3 ? 'LEARNED' : 'FAMILIAR',
                memoryStrength: r1(Math.min(10, strength + 0.4)), stability: r1(Math.min(180, stability * 1.2)),
                repetitionCount: rep + 1, consecutiveRight: nc, wrongCount: wc,
                nextReviewAt: new Date(Date.now() + 86400000), lastTestedAt: undefined as Date | undefined,
            };
        }
        return {
            stage: 'UNFAMILIAR', memoryStrength: r1(Math.max(0, strength - 2)),
            stability: Math.max(1, r1(stability * 0.5)),
            repetitionCount: rep + 1, consecutiveRight: 0, wrongCount: wc + 1,
            nextReviewAt: new Date(Date.now() + 600000), lastTestedAt: undefined as Date | undefined,
        };
    }

    const states: any[] = [];
    for (const [word, events] of byWord) {
        events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        let s: any = null;
        for (const e of events) s = nextMemoryState(s, e.score);
        s.lastTestedAt = events[events.length - 1].timestamp;
        states.push({ id: crypto.randomUUID(), userId, word, ...s });
    }
    for (const s of states) {
        await prisma.userWordState.upsert({
            where: { userId_word: { userId, word: s.word } },
            create: s,
            update: s,
        });
    }

    // ---- AI chat history (2 sessions) ----
    const sess1 = await prisma.chat_sessions.create({
        data: {
            id: `session_demo_${Date.now()}_a`, userId, title: '单词: ubiquitous',
            category: 1, word: 'ubiquitous', updatedAt: new Date(Date.now() - 12 * 86400000),
        },
    });
    const sess2 = await prisma.chat_sessions.create({
        data: {
            id: `session_demo_${Date.now()}_b`, userId, title: '单词组学习',
            category: 2, wordGroup: 'crucial,demonstrate,facilitate', updatedAt: new Date(Date.now() - 5 * 86400000),
        },
    });
    const msg = (sessionId: string, role: string, content: string, daysAgo: number) => ({
        id: `msg_demo_${crypto.randomUUID().slice(0, 8)}`, sessionId, role, content,
        createdAt: new Date(Date.now() - daysAgo * 86400000),
    });
    await prisma.chat_messages.createMany({
        data: [
            msg(sess1.id, 'user', 'ubiquitous 和 common 有什么区别？', 12),
            msg(sess1.id, 'assistant', '**ubiquitous** 强调"无处不在、仿佛同时出现在所有地方"，语气更书面且带一点夸张修辞；**common** 只是"常见"。例句：Smartphones have become ubiquitous in modern classrooms.', 12),
            msg(sess1.id, 'user', '给我三个例句', 12),
            msg(sess1.id, 'assistant', '1. Coffee shops are ubiquitous in this city.\n2. The logo is ubiquitous across all their products.\n3. Wi-Fi is now ubiquitous in airports.', 12),
            msg(sess2.id, 'user', '帮我区分 crucial, demonstrate, facilitate 这组词', 5),
            msg(sess2.id, 'assistant', '- **crucial**（关键的）：a crucial decision\n- **demonstrate**（证明/演示）：demonstrate the effectiveness\n- **facilitate**（促进）：facilitate communication\n记忆钩子：crucial 是"十字路口(cross)"的抉择，facilitate 的词根 facil-=容易。', 5),
        ],
    });

    // ---- community notes ----
    await prisma.word_notes.createMany({
        data: [
            { id: crypto.randomUUID(), userId, word: 'ubiquitous', content: '谐音口诀：u-biq-uitous → "有必扣它死"→ 到处都有，必有它，跑不掉。', likeCount: 12, createdAt: new Date(Date.now() - 40 * 86400000) },
            { id: crypto.randomUUID(), userId, word: 'crucial', content: 'cruc 词根 = cross 十字路口，站在十字路口的选择当然是关键的！', likeCount: 7, createdAt: new Date(Date.now() - 25 * 86400000) },
            { id: crypto.randomUUID(), userId, word: 'facilitate', content: 'facil（容易的，同 facile/facility）+ itate 使动 → 使变得容易 = 促进。', likeCount: 4, createdAt: new Date(Date.now() - 9 * 86400000) },
        ],
    });

    // ---- summary ----
    const stageCounts = states.reduce<Record<string, number>>((acc, s) => {
        acc[s.stage] = (acc[s.stage] || 0) + 1;
        return acc;
    }, {});
    const correct = quizzes.filter((q) => q.score > 0).length;
    console.log('\n=== 注入完成 ===');
    console.log(`测验记录: ${quizzes.length}（正确率 ${(Math.round((correct / quizzes.length) * 100))}%）`);
    console.log(`浏览记录: ${visits.length}`);
    console.log(`词汇状态: ${states.length} 词`, stageCounts);
    console.log(`聊天会话: 2 · 社区笔记: 3`);
    console.log(`\n登录凭证: ${ACCOUNT.email} / ${ACCOUNT.password}`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
