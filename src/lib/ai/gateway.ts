import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Unified AI Gateway for WordLink Agent Matrix
 * ---------------------------------------------
 * All vertical agents (passport / tutor ...)
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

// Prompt files are static for the process lifetime — cache them in memory
// so each request doesn't pay an fs.readFile per template.
const promptCache = new Map<string, string>();

/** Load a prompt template from data/ai_prompts with graceful fallback. */
export async function loadPrompt(filename: string): Promise<string> {
    const cached = promptCache.get(filename);
    if (cached !== undefined) return cached;
    try {
        const filePath = path.join(PROMPT_DIR, filename);
        const content = await fs.promises.readFile(filePath, 'utf8');
        promptCache.set(filename, content);
        return content;
    } catch {
        return '';
    }
}

/** Stable cache key for an agent + arbitrary payload. */
export function agentCacheKey(agent: string, payload: unknown): string {
    const hash = crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
    return `${agent}-${hash}`;
}

function userCacheTag(userId: string): string {
    return crypto.createHash('sha256').update(userId).digest('hex').slice(0, 16);
}

/** Per-user cache key so account deletion can deterministically remove all disk caches for that user. */
export function userAgentCacheKey(agent: string, userId: string, payload: unknown): string {
    const hash = crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
    return `${agent}-u${userCacheTag(userId)}-${hash}`;
}

/** Delete all on-disk cached artifacts belonging to a user for a given agent (best-effort). */
export async function deleteUserAgentCache(agent: string, userId: string): Promise<void> {
    try {
        const dir = path.join(CACHE_ROOT, agent);
        const prefix = `${agent}-u${userCacheTag(userId)}-`;
        const entries = await fs.promises.readdir(dir).catch(() => [] as string[]);
        await Promise.all(
            entries
                .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
                .map((name) => fs.promises.unlink(path.join(dir, name)).catch(() => {})),
        );
    } catch (e) {
        console.warn(`[ai-gateway] failed to purge ${agent} cache for user:`, e);
    }
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
    /** Aborts the upstream request, e.g. when the browser goes away mid-stream. */
    signal?: AbortSignal;
}

/** The provider answered with an error status: 402 = balance exhausted, 429 = rate limited, ... */
export class LlmError extends Error {
    constructor(readonly status: number, detail: string) {
        super(`LLM API error: ${status} ${detail.slice(0, 300)}`);
        this.name = 'LlmError';
    }
}

function apiKey(): string {
    // Prefer SiliconFlow key; fall back to legacy DeepSeek key if present.
    const key = process.env.SILICONFLOW_APIKEY || process.env.DEEPSEEK_APIKEY;
    if (!key) throw new Error('SILICONFLOW_APIKEY is not configured');
    return key;
}

/**
 * POST /chat/completions. `timeoutMs` bounds the wait for the response headers only,
 * so a long streamed answer is not cut off halfway.
 */
async function postCompletion(
    messages: ChatMessage[],
    opts: DeepseekOptions,
    stream: boolean,
    timeoutMs: number,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`LLM request timed out after ${timeoutMs} ms`)), timeoutMs);
    const signal = opts.signal ? AbortSignal.any([opts.signal, controller.signal]) : controller.signal;
    try {
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
                stream,
            }),
            signal,
        });
        if (!res.ok || !res.body) {
            const errText = await res.text().catch(() => '');
            throw new LlmError(res.status, errText);
        }
        return res;
    } finally {
        clearTimeout(timer);
    }
}

/** Non-streaming completion -> full text. */
export async function completeDeepseek(messages: ChatMessage[], opts: DeepseekOptions = {}): Promise<string> {
    const res = await postCompletion(messages, opts, false, 90_000);
    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
}

/**
 * Streaming completion. Resolves once the provider has accepted the request (throws
 * `LlmError` otherwise), so callers can still answer with a proper status code; the
 * returned generator then yields the text deltas. Stopping the iteration early
 * (`break`, `return()`) closes the upstream connection.
 */
export async function streamDeepseek(messages: ChatMessage[], opts: DeepseekOptions = {}): Promise<AsyncGenerator<string>> {
    const res = await postCompletion(messages, opts, true, 30_000);
    return readDeltas(res.body!);
}

async function* readDeltas(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    // SSE events can be split across network chunks: only parse complete lines.
    let buffer = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                const delta = deltaOf(line);
                if (delta) yield delta;
            }
        }
        const delta = deltaOf(buffer + decoder.decode());
        if (delta) yield delta;
    } finally {
        await reader.cancel().catch(() => {});
    }
}

function deltaOf(line: string): string {
    if (!line.startsWith('data:')) return '';
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return '';
    try {
        return JSON.parse(data).choices?.[0]?.delta?.content || '';
    } catch {
        return '';
    }
}
