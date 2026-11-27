import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession, isPro } from '@/lib/auth';
import {
    quotaExceededResponse,
    recordUsage,
    releaseQuotaReservation,
    reserveDailyQuota,
} from '@/lib/quota';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { loadPrompt, streamDeepseek, LlmError, type ChatMessage } from '@/lib/ai/gateway';

/** 每次带给模型的历史条数。历史从数据库读，不用客户端传来的（客户端可以随意伪造） */
const HISTORY_LIMIT = 20;
const MAX_MESSAGE_CHARS = 4000;

const DEFAULT_MODEL = process.env.LLM_MODEL || 'deepseek-ai/DeepSeek-V3.2';
// 前端的两个选项映射到环境变量配置的模型；其他值一律用默认模型，客户端不能指定任意（高价）模型
const MODEL_CHOICES: Record<string, { model: string; temperature: number }> = {
    'deepseek-chat': { model: DEFAULT_MODEL, temperature: 1.3 },
    // 推理模型官方建议温度 0.6 左右，太高容易跑题
    'deepseek-reasoner': { model: process.env.LLM_MODEL_REASONER || 'deepseek-ai/DeepSeek-R1', temperature: 0.6 },
};

/**
 * 学习数据摘要：单词模式只看这个词，词组模式只看组内的词，全局模式看最近的整体记录。
 * 只取最近的一部分，避免全局模式每条消息都把上千条记录塞进 prompt。
 */
async function buildUserContext(userId: string, words: string[] | null): Promise<string> {
    const wordFilter = words ? { word: { in: words } } : {};
    const [visits, tests, template] = await Promise.all([
        prisma.wordVisit.findMany({
            where: { userId, ...wordFilter },
            orderBy: { timestamp: 'desc' },
            take: 500,
            select: { word: true },
        }),
        prisma.quizRecord.findMany({
            where: { userId, ...wordFilter },
            orderBy: { timestamp: 'desc' },
            take: 50,
            select: { word: true, score: true },
        }),
        loadPrompt('user_context.txt'),
    ]);
    const studied = [...new Set(visits.map((v) => v.word))].slice(0, 100);
    return template
        .replace(/\{\{historyCount\}\}/g, String(studied.length))
        .replace(/\{\{historyList\}\}/g, studied.join(', ') || 'None')
        .replace(/\{\{quizCount\}\}/g, String(tests.length))
        .replace(/\{\{quizList\}\}/g, tests.map((t) => `${t.word}(score:${t.score})`).join(', ') || 'None');
}

async function buildSystemPrompt(
    userId: string,
    category: number,
    word: string | null,
    groupWords: string[],
    lang: 'zh' | 'en',
): Promise<string> {
    let prompt: string;
    let contextWords: string[] | null = null;

    if (category === 2 && groupWords.length > 0) {
        // 词组模式用专门的模板替换基础家教 prompt
        prompt = (await loadPrompt('word_group_tutor.txt')).replace(/\{\{wordList\}\}/g, groupWords.join(', '));
        contextWords = groupWords;
    } else {
        prompt = (await loadPrompt('vocabulary_tutor.txt')) || 'You are a helpful English vocabulary tutor.';
        if (category === 1 && word) {
            prompt += '\n\n' + (await loadPrompt('word_context.txt')).replace(/\{\{word\}\}/g, word);
            contextWords = [word.toLowerCase()];
        }
    }

    // 单词 / 词组 / 全局模式附上学习数据，「其他」模式不带
    if (category === 1 || category === 2 || category === 3) {
        const context = await buildUserContext(userId, contextWords);
        prompt = prompt.includes('{{userContext}}')
            ? prompt.replace(/\{\{userContext\}\}/g, context)
            : `${prompt}\n\n${context}`;
    }

    return `${prompt}\n\n${lang === 'zh' ? 'Always reply in Simplified Chinese (简体中文).' : 'Reply in English.'}`;
}

/**
 * POST /api/ai/chat —— 流式 AI 对话。
 * 请求体：{ newMessage, sessionId?, model?, category?, word?, wordGroup?, title? }
 * sessionId 为空时新建会话；后四项只在新建时使用，已有会话沿用自己的模式和单词。
 * 响应是 SSE：先发 {type:'session', id, title}，再逐段发 {type:'text', content}，最后 [DONE]。
 */
export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 流式 LLM 调用成本高：按用户限流
    const gate = rateLimit(`chat:${session.id}`, 20, 60_000);
    if (!gate.ok) return tooManyRequests(gate.retryAfterSec);

    await ensureLocalUser(session);

    // AI 回复语言跟随界面语言：NEXT_LOCALE cookie 即 UI 语言，session 偏好兜底
    const cookieLang = (await cookies()).get('NEXT_LOCALE')?.value;
    const lang = cookieLang === 'zh' || cookieLang === 'en'
        ? cookieLang
        : (session.preferredLanguage === 'zh' ? 'zh' : 'en');

    let reservedQuotaId: string | null = null;
    try {
        const body = await request.json().catch(() => null);
        const newMessage = typeof body?.newMessage === 'string' ? body.newMessage.trim().slice(0, MAX_MESSAGE_CHARS) : '';
        if (!newMessage) {
            return NextResponse.json({ error: 'Missing message' }, { status: 400 });
        }

        // 付费墙：免费用户原子预占每日额度（放参数校验之后，防空消息消耗额度；Pro 不限）
        if (!isPro(session)) {
            const reservation = await reserveDailyQuota(session.id, 'aiChat');
            if (!reservation.allowed) return quotaExceededResponse(reservation, 'aiChat');
            reservedQuotaId = reservation.usageLogId;
        }
        const choice = MODEL_CHOICES[typeof body?.model === 'string' ? body.model : ''] ?? MODEL_CHOICES['deepseek-chat'];

        // 已有会话：只认自己的，模式和单词以数据库为准
        const existing = typeof body?.sessionId === 'string'
            ? await prisma.chat_sessions.findFirst({ where: { id: body.sessionId, userId: session.id } })
            : null;

        const category = existing?.category ?? ([1, 2, 3, 4].includes(body?.category) ? (body.category as number) : 4);
        const word: string | null = (existing ? existing.word : typeof body?.word === 'string' ? body.word.trim().slice(0, 100) : '') || null;
        const wordGroup: string | null = (existing ? existing.wordGroup : typeof body?.wordGroup === 'string' ? body.wordGroup.slice(0, 500) : '') || null;
        const groupWords = (wordGroup ?? '')
            .split(',')
            .map((w) => w.trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 50);

        const [systemPrompt, history] = await Promise.all([
            buildSystemPrompt(session.id, category, word, groupWords, lang),
            existing
                ? prisma.chat_messages.findMany({
                    where: { sessionId: existing.id },
                    orderBy: { createdAt: 'desc' },
                    take: HISTORY_LIMIT,
                    select: { role: true, content: true },
                })
                : Promise.resolve([]),
        ]);

        const fullMessages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...history.reverse().map((m): ChatMessage => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content.slice(0, MAX_MESSAGE_CHARS),
            })),
            { role: 'user', content: newMessage },
        ];

        // 先确认模型接受了请求，再建会话、存消息、记额度：上游失败（余额不足、超时……）不占用户的免费次数
        const upstream = new AbortController();
        let deltas: AsyncGenerator<string>;
        try {
            deltas = await streamDeepseek(fullMessages, {
                model: choice.model,
                temperature: choice.temperature,
                maxTokens: 2048,
                signal: upstream.signal,
            });
        } catch (e) {
            await releaseQuotaReservation(reservedQuotaId);
            reservedQuotaId = null;
            console.error('[ai/chat] LLM request failed:', e);
            const status = e instanceof LlmError ? e.status : 0;
            return NextResponse.json({ error: status ? `LLM request failed (${status})` : 'LLM request failed' }, { status: 502 });
        }
        // 上游已接受流式请求，预占额度正式计费，不再释放
        const quotaAlreadyRecorded = reservedQuotaId !== null;
        reservedQuotaId = null;

        let chatSession;
        try {
            const now = new Date();
            if (existing) {
                chatSession = await prisma.chat_sessions.update({ where: { id: existing.id }, data: { updatedAt: now } });
            } else {
                // 单词 / 词组会话用前端按界面语言起的标题，其余用第一句话当标题
                const clientTitle = typeof body?.title === 'string' ? body.title.trim().slice(0, 60) : '';
                const title = (category === 1 || category === 2) && clientTitle ? clientTitle : newMessage.slice(0, 40);
                chatSession = await prisma.chat_sessions.create({
                    data: {
                        id: `session_${randomUUID()}`,
                        userId: session.id,
                        title,
                        category,
                        word: category === 1 ? word : null,
                        wordGroup: category === 2 ? wordGroup : null,
                        updatedAt: now,
                    },
                });
            }
            await prisma.chat_messages.create({
                data: { id: `msg_${randomUUID()}`, sessionId: chatSession.id, role: 'user', content: newMessage },
            });
            if (!quotaAlreadyRecorded) {
                await recordUsage(session.id, 'aiChat');
            }
        } catch (e) {
            upstream.abort();
            throw e;
        }

        const { id: sessionId, title } = chatSession;
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
                const send = (data: string) => {
                    try {
                        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                    } catch {
                        /* 浏览器已经断开 */
                    }
                };
                send(JSON.stringify({ type: 'session', id: sessionId, title }));

                let reply = '';
                try {
                    for await (const delta of deltas) {
                        reply += delta;
                        send(JSON.stringify({ type: 'text', content: delta }));
                    }
                } catch (e) {
                    if (!upstream.signal.aborted) {
                        console.error('[ai/chat] stream interrupted:', e);
                        send(JSON.stringify({ type: 'error' }));
                    }
                }

                // 中途停止或断开也保存已经生成的部分，和用户在界面上看到的一致
                if (reply) {
                    await prisma.chat_messages
                        .create({ data: { id: `msg_${randomUUID()}`, sessionId, role: 'assistant', content: reply } })
                        .catch((e) => console.error('[ai/chat] failed to save reply:', e));
                }
                send('[DONE]');
                try {
                    controller.close();
                } catch {
                    /* 已经关闭 */
                }
            },
            // 用户点了停止或关掉页面：立刻断开上游，不再白白生成
            cancel() {
                upstream.abort();
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
                // 反向代理（nginx）默认会缓冲整段响应，流式输出就变成一次性吐出
                'X-Accel-Buffering': 'no',
            },
        });
    } catch (error) {
        await releaseQuotaReservation(reservedQuotaId);
        console.error('Chat API Error:', error);
        return NextResponse.json({ error: 'Chat API Error' }, { status: 500 });
    }
}
