import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, ensureLocalUser } from '@/lib/auth';
import {
    loadPrompt,
    completeDeepseek,
    readAgentCache,
    writeAgentCache,
    agentCacheKey,
} from '@/lib/ai/gateway';

/**
 * Cognitive Graph Navigator Agent  (P1)
 * Computes the shortest activation chain through the word-fission graph
 * from words the learner already knows to a target word, then has the LLM
 * explain each hop.
 *
 * POST { target: string }
 */

const MAX_DEPTH = 4;
const FRONTIER_CAP = 400;

// Ultra-common fallback seeds for guests with no learning history yet.
const BASIC_SEEDS = [
    'get', 'make', 'take', 'give', 'come', 'go', 'see', 'know', 'think', 'use',
    'work', 'help', 'talk', 'look', 'feel', 'want', 'time', 'way', 'world', 'life',
];

interface Hop {
    from: string;
    to: string;
    relation: string;
}

async function getKnownWords(userId: string | null): Promise<string[]> {
    if (userId) {
        const learned = await prisma.userWordState.findMany({
            where: { userId, stage: { in: ['LEARNED', 'MASTERED', 'FAMILIAR'] } },
            orderBy: { memoryStrength: 'desc' },
            take: 200,
            select: { word: true },
        });
        if (learned.length) return learned.map((w) => w.word);
        const visited = await prisma.wordVisit.findMany({
            where: { userId },
            orderBy: { timestamp: 'desc' },
            take: 50,
            select: { word: true },
        });
        if (visited.length) return [...new Set(visited.map((w) => w.word))];
    }
    return BASIC_SEEDS;
}

/** BFS over word_fission edges (word -> synonym). Returns hop chain or null. */
async function findPath(seeds: string[], target: string): Promise<Hop[] | null> {
    const targetLower = target.toLowerCase();
    const visited = new Set<string>(seeds.map((s) => s.toLowerCase()));
    let frontier = seeds.map((s) => ({ word: s.toLowerCase(), path: [] as Hop[] }));

    for (let depth = 0; depth < MAX_DEPTH; depth++) {
        if (!frontier.length) break;
        const current = frontier.slice(0, FRONTIER_CAP).map((f) => f.word);
        const edges = await prisma.word_fission.findMany({
            where: { word: { in: current } },
            select: { word: true, synonym: true },
        });

        const edgeByWord = new Map<string, { synonym: string; relation: string }[]>();
        for (const e of edges) {
            const list = edgeByWord.get(e.word.toLowerCase()) || [];
            list.push({ synonym: (e.synonym || '').toLowerCase().trim(), relation: 'synonym' });
            edgeByWord.set(e.word.toLowerCase(), list);
        }

        const nextFrontier: typeof frontier = [];
        for (const node of frontier) {
            const neighbours = edgeByWord.get(node.word) || [];
            for (const nb of neighbours) {
                if (!nb.synonym || visited.has(nb.synonym)) continue;
                visited.add(nb.synonym);
                const path = [...node.path, { from: node.word, to: nb.synonym, relation: nb.relation }];
                if (nb.synonym === targetLower) return path;
                nextFrontier.push({ word: nb.synonym, path });
            }
        }
        frontier = nextFrontier;
    }
    return null;
}

export async function POST(request: NextRequest) {
    const session = await getSession();
    if (session) await ensureLocalUser(session);

    let body: { target?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const target = (body.target || '').trim().toLowerCase();
    if (!target || !/^[a-zA-Z][a-zA-Z-]{1,40}$/.test(target)) {
        return NextResponse.json({ error: 'Provide a valid English target word.' }, { status: 400 });
    }

    try {
        const seeds = await getKnownWords(session?.id || null);
        const direct = seeds.includes(target);

        let path: Hop[] = [];
        if (!direct) {
            const found = await findPath(seeds, target);
            if (!found) {
                return NextResponse.json({
                    found: false,
                    message: `No activation route to "${target}" within ${MAX_DEPTH} hops of your known vocabulary.`,
                    knownSeedCount: seeds.length,
                });
            }
            path = found;
        }

        // ---- AI explanation (cached per path) ------------------------------
        const cacheKey = agentCacheKey('navigator', { target, path });
        let explanation = await readAgentCache<string>('navigator', cacheKey);
        if (!explanation) {
            try {
                const template = await loadPrompt('navigator.txt');
                explanation = await completeDeepseek(
                    [
                        { role: 'system', content: template },
                        {
                            role: 'user',
                            content: `Target word: ${target}\nLearner's known seed words (sample): ${seeds.slice(0, 15).join(', ')}\nComputed path: ${JSON.stringify(path)}`,
                        },
                    ],
                    { temperature: 0.7, maxTokens: 600 }
                );
                await writeAgentCache('navigator', cacheKey, explanation);
            } catch (e) {
                console.error('[navigator] explanation failed:', e);
                explanation = '';
            }
        }

        return NextResponse.json({
            found: true,
            direct,
            target,
            path,
            hops: path.length,
            explanation,
            knownSeedCount: seeds.length,
        });
    } catch (error: any) {
        console.error('[navigator] failed:', error);
        return NextResponse.json({ error: 'Navigator failed', details: error.message }, { status: 500 });
    }
}
