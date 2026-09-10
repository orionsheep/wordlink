// 进程内滑动窗口限流器（单实例部署够用；上集群时需换 Redis 实现）
const buckets = new Map<string, number[]>();

const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
    ok: boolean;
    retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);

    if (hits.length >= limit) {
        buckets.set(key, hits);
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000)) };
    }

    hits.push(now);
    buckets.set(key, hits);

    // 防止 Map 无限增长：超阈值时清理全部过期桶
    if (buckets.size > MAX_TRACKED_KEYS) {
        for (const [k, v] of buckets) {
            if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
        }
    }

    return { ok: true, retryAfterSec: 0 };
}

export function clientIp(request: Request): string {
    const fwd = request.headers.get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
    return request.headers.get('x-real-ip') || 'unknown';
}

/** 标准 429 响应（带 Retry-After），LLM 类路由统一使用 */
export function tooManyRequests(retryAfterSec: number): Response {
    return new Response(
        JSON.stringify({ error: 'Too many requests, please slow down.' }),
        {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfterSec) },
        },
    );
}

/** 供流式路由（SSE）使用的 429 JSON 响应 */
export function rateLimitJson(retryAfterSec: number): Response {
    return tooManyRequests(retryAfterSec);
}
