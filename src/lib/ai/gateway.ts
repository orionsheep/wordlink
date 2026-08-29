import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Unified AI Gateway for WordLink Agent Matrix
 * ---------------------------------------------
 * All vertical agents (passport / navigator / tutor ...)
 * share this single gateway so that:
 *   1. Prompt templates live in one place  -> data/ai_prompts/*.txt
 *   2. DeepSeek calls are centralized       -> streaming + non-streaming
 *   3. Generated content is cached on disk  -> data/generated/<agent>/<hash>.json
 *      (live demos NEVER depend on a real-time API call)
 */

const PROMPT_DIR = path.join(process.cwd(), 'data', 'ai_prompts');
const CACHE_ROOT = path.join(process.cwd(), 'data', 'generated');

/** SiliconFlow OpenAI-compatible endpoint. */
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.siliconflow.cn/v1';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-ai/DeepSeek-V3.2';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/** Load a prompt template from data/ai_prompts with graceful fallback. */
export async function loadPrompt(filename: string): Promise<string> {
    try {
        const filePath = path.join(PROMPT_DIR, filename);
        return await fs.promises.readFile(filePath, 'utf8');
    } catch {
        return '';
    }
}

/** Stable cache key for an agent + arbitrary payload. */
export function agentCacheKey(agent: string, payload: unknown): string {
    const hash = crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
    return `${agent}-${hash}`;
}

interface CacheEntry<T> {
    savedAt: string;
    data: T;
}

/** Read a cached agent result (7-day TTL). */
export async function readAgentCache<T>(agent: string, key: string): Promise<T | null> {
    try {
        const filePath = path.join(CACHE_ROOT, agent, `${key}.json`);
        const raw = await fs.promises.readFile(filePath, 'utf8');
        const entry = JSON.parse(raw) as CacheEntry<T>;
        if (!entry?.data) return null;
        if (Date.now() - new Date(entry.savedAt).getTime() > 7 * 24 * 3600 * 1000) return null;
        return entry.data;
    } catch {
        return null;
    }
}

/** Persist an agent result to the disk cache (best-effort, never throws). */
export async function writeAgentCache<T>(agent: string, key: string, data: T): Promise<void> {
    try {
        const dir = path.join(CACHE_ROOT, agent);
        await fs.promises.mkdir(dir, { recursive: true });
        const entry: CacheEntry<T> = { savedAt: new Date().toISOString(), data };
        await fs.promises.writeFile(path.join(dir, `${key}.json`), JSON.stringify(entry), 'utf8');
    } catch (e) {
        console.warn(`[ai-gateway] cache write failed for ${agent}/${key}:`, e);
    }
}

interface DeepseekOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

function apiKey(): string {
    // Prefer SiliconFlow key; fall back to legacy DeepSeek key if present.
    const key = process.env.SILICONFLOW_APIKEY || process.env.DEEPSEEK_APIKEY;
    if (!key) throw new Error('SILICONFLOW_APIKEY is not configured');
    return key;
}

/** Non-streaming completion -> full text. */
export async function completeDeepseek(messages: ChatMessage[], opts: DeepseekOptions = {}): Promise<string> {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey()}`,
        },
        body: JSON.stringify({
            model: opts.model || LLM_MODEL,
            messages,
            temperature: opts.temperature ?? 1.0,
            max_tokens: opts.maxTokens ?? 2048,
            stream: false,
        }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`LLM API error: ${res.status} ${errText.slice(0, 300)}`);
    }
    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
}

/**
 * Streaming completion as an SSE event-source of `{type:'text', content}` frames.
 * Returns the raw Response ready to be returned from a route handler.
 */
export async function streamDeepseekSse(messages: ChatMessage[], opts: DeepseekOptions = {}): Promise<Response> {
    const deepseekRes = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey()}`,
        },
        body: JSON.stringify({
            model: opts.model || LLM_MODEL,
            messages,
            temperature: opts.temperature ?? 1.0,
            max_tokens: opts.maxTokens ?? 2048,
            stream: true,
        }),
    });
    if (!deepseekRes.ok || !deepseekRes.body) {
        const errText = await deepseekRes.text().catch(() => '');
        throw new Error(`LLM API error: ${deepseekRes.status} ${errText.slice(0, 300)}`);
    }

    const encoder = new TextEncoder();
    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();

    (async () => {
        const reader = deepseekRes.body!.getReader();
        const decoder = new TextDecoder();
        try {
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content || '';
                        if (content) {
                            await writer.write(
                                encoder.encode(`data: ${JSON.stringify({ type: 'text', content })}\n\n`)
                            );
                        }
                    } catch {
                        /* partial json line - ignore */
                    }
                }
            }
        } catch (e) {
            console.error('[ai-gateway] stream error:', e);
            await writer.write(
                encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'stream interrupted' })}\n\n`)
            );
        } finally {
            await writer.write(encoder.encode('data: [DONE]\n\n'));
            await writer.close();
        }
    })();

    return new Response(responseStream.readable, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        },
    });
}

/** Encode one SSE frame (used by agents before handing off to the gateway stream). */
export function sseFrame(payload: Record<string, unknown>): string {
    return `data: ${JSON.stringify(payload)}\n\n`;
}
