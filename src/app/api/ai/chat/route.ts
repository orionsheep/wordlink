import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

// --- Types ---
interface ChatRequest {
    messages: { role: string; content: string }[];
    newMessage: string; // The confusing part: 'messages' usually contains history. 'newMessage' is the one to save.
    model?: string;
    word?: string;
    category?: number;
    sessionId?: string;
    wordGroup?: string; // Comma separated
    userContext?: any;
}

// --- Helper Functions ---
// function loadPrompt(filename: string) {
//     try {
//         const promptPath = path.join(process.cwd(), 'data', 'ai_prompts', filename);
async function loadPrompt(filename: string): Promise<string> {
    try {
        const filePath = path.join(process.cwd(), 'data', 'ai_prompts', filename);
        return await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
        console.error(`Error loading prompt ${filename}:`, error);
        // Fallbacks
        if (filename === 'vocabulary_tutor.txt') return 'You are a helpful English vocabulary tutor.';
        return '';
    }
}

// --- Main Handler ---
export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureLocalUser(session);

    try {
        const body: ChatRequest = await request.json();
        const { messages, newMessage, model = 'deepseek-chat', word, wordGroup, userContext } = body;
        let { category = 4, sessionId } = body;

        // 1. Session Management
        let chatSession;
        if (sessionId) {
            chatSession = await prisma.chat_sessions.findUnique({
                where: { id: sessionId },
            });
            // If session not found or belongs to another user, create new
            if (!chatSession || chatSession.userId !== session.id) {
                sessionId = undefined;
                chatSession = null;
            }
        }

        if (!sessionId) {
            let title = '新对话';
            if (category === 1 && word) title = `单词: ${word}`;
            if (category === 2 && wordGroup) title = '单词组学习';
            if (category === 3) title = '全局调用';

            chatSession = await prisma.chat_sessions.create({
                data: {
                    id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    userId: session.id,
                    title,
                    category,
                    word: category === 1 ? word : undefined,
                    wordGroup: category === 2 ? wordGroup : undefined,
                    updatedAt: new Date()
                }
            });
            sessionId = chatSession.id;
        } else {
            // Update timestamp
            await prisma.chat_sessions.update({
                where: { id: sessionId },
                data: { updatedAt: new Date() }
            });
        }

        // 2. Persist User Message
        await prisma.chat_messages.create({
            data: {
                id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                sessionId: sessionId!,
                role: 'user',
                content: newMessage,
            }
        });

        // 3. Construct System Prompt
        console.log(`[ChatDebug] Category: ${category}, hasWord: ${!!word}, hasUserContext: ${!!userContext}`);
        let systemPrompt = await loadPrompt('vocabulary_tutor.txt');

        if (category === 1 && word) {
            console.log('[ChatDebug] Appending Word Context');
            const wordContextTemplate = await loadPrompt('word_context.txt');
            systemPrompt += '\n\n' + wordContextTemplate.replace(/\{\{word\}\}/g, word);
        }

        if (category === 2 && wordGroup) {
            console.log('[ChatDebug] Using Word Group Context');
            // For Category 2, we Override the base 'vocabulary_tutor' with 'word_group_tutor'
            // OR we append it? Implementation Plan said use 'word_group_tutor'.
            // Let's replace the base prompt entirely or start with it.
            // Actually, usually we replace the generic tutor for specific tasks.
            const groupTemplate = await loadPrompt('word_group_tutor.txt');
            systemPrompt = groupTemplate.replace(/\{\{wordList\}\}/g, wordGroup.split(',').join(', '));
        }

        // Inject User Context for BOTH Category 1 and 3 (and potentially others if useful)
        // Previous logic restricted it to Category 3 only.
        // Inject User Context for Category 1, 2, and 3
        // IMPORTANT: Filter context based on mode
        if (userContext && (category === 1 || category === 2 || category === 3)) {
            console.log('[ChatDebug] Appending User Context');
            const userContextTemplate = await loadPrompt('user_context.txt');

            let filteredHistory = userContext.recentHistory || [];
            let filteredTests = userContext.recentTests || [];

            // Category 1: Filter to only THIS word
            if (category === 1 && word) {
                filteredHistory = filteredHistory.filter((h: any) => h.word?.toLowerCase() === word.toLowerCase());
                filteredTests = filteredTests.filter((t: any) => t.word?.toLowerCase() === word.toLowerCase());
            }
            // Category 2: Filter to only words in the group
            else if (category === 2 && wordGroup) {
                const groupWords = wordGroup.split(',').map((w: string) => w.trim().toLowerCase());
                filteredHistory = filteredHistory.filter((h: any) => groupWords.includes(h.word?.toLowerCase()));
                filteredTests = filteredTests.filter((t: any) => groupWords.includes(t.word?.toLowerCase()));
            }
            // Category 3: Use all data (no filtering)

            const historyList = filteredHistory.slice(0, 1000).map((h: any) => h.word).filter((w: string, i: number, arr: string[]) => arr.indexOf(w) === i).join(', ') || 'None';
            const quizList = filteredTests.slice(0, 1000).map((q: any) => `${q.word}(score:${q.score})`).join(', ') || 'None';

            const filled = userContextTemplate
                .replace(/\{\{historyCount\}\}/g, String(filteredHistory.length || 0))
                .replace(/\{\{historyList\}\}/g, historyList)
                .replace(/\{\{quizCount\}\}/g, String(filteredTests.length || 0))
                .replace(/\{\{quizList\}\}/g, quizList);
            systemPrompt += '\n\n' + filled;
        } else {
            console.log('[ChatDebug] Skipping User Context (Condition not met: not cat 1 or 3, or no context)');
        }

        console.log(`[ChatDebug] Final System Prompt Length: ${systemPrompt.length}`);

        // 4. API Call
        const fullMessages = [
            { role: 'system', content: systemPrompt },
            ...messages, // History
            { role: 'user', content: newMessage } // Current
        ];

        const encoder = new TextEncoder();
        const responseStream = new TransformStream();
        const writer = responseStream.writable.getWriter();

        // Write session ID immediately
        writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'session', id: sessionId })}\n\n`));

        // Write Debug Info
        writer.write(encoder.encode(`data: ${JSON.stringify({
            type: 'debug',
            category,
            hasWord: !!word,
            hasUserContext: !!userContext,
            systemPromptLength: systemPrompt.length
        })}\n\n`));

        // Start DeepSeek Fetch
        const deepseekRes = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPSEEK_APIKEY}`,
            },
            body: JSON.stringify({
                model,
                messages: fullMessages,
                stream: true,
                temperature: 1.3,
            }),
        });

        if (!deepseekRes.ok) {
            const errText = await deepseekRes.text();
            throw new Error(`DeepSeek API error: ${deepseekRes.status} ${errText}`);
        }

        // 5. Stream Processing & Persistence
        // We handle the stream reading, passthrough, and accumulation here.
        // Important: we must NOT await the database save inside the critical path of a chunk if possible, 
        // but we DO need to await it before closing the stream to ensure it runs.

        (async () => {
            const reader = deepseekRes.body?.getReader();
            if (!reader) { writer.close(); return; }

            const decoder = new TextDecoder();
            let fullContent = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6).trim();
                            if (data === '[DONE]') continue;

                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content || '';
                                if (content) {
                                    fullContent += content;
                                    // Send delta to frontend
                                    const payload = JSON.stringify({ type: 'text', content });
                                    await writer.write(encoder.encode(`data: ${payload}\n\n`));
                                }
                            } catch { }
                        }
                    }
                }
            } finally {
                // 6. Save Assistant Message (The Grand Finale)
                if (fullContent && sessionId) {
                    try {
                        await prisma.chat_messages.create({
                            data: {
                                id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                sessionId,
                                role: 'assistant',
                                content: fullContent
                            }
                        });
                        console.log(`Saved assistant message for session ${sessionId}`);
                    } catch (e) {
                        console.error('Failed to save assistant message:', e);
                        // We can also send an error event to frontend if we want
                    }
                }
                await writer.write(encoder.encode('data: [DONE]\n\n'));
                await writer.close();
            }
        })();

        return new NextResponse(responseStream.readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error: any) {
        console.error('Chat API Error:', error);
        return NextResponse.json({
            error: 'Chat API Error',
            details: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
