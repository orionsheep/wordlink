// 进程内滑动窗口限流器（单实例部署够用；上集群时需换 Redis 实现）
interface Bucket {
    hits: number[];
    windowMs: number;
    expiresAt: number;
}

const buckets = new Map<string, Bucket>();

const MAX_TRACKED_KEYS = 10_000;
const PRUNE_MIN_INTERVAL_MS = 5_000;
let lastPruneAt = 0;

export interface RateLimitResult {
    ok: boolean;
    retryAfterSec: number;
}

function pruneBuckets(now: number, force = false): void {
    if (!force && now - lastPruneAt < PRUNE_MIN_INTERVAL_MS) return;
    lastPruneAt = now;
    for (const [k, b] of buckets) {
        if (b.expiresAt <= now) {
            buckets.delete(k);
        }
    }
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const existing = buckets.get(key);
    const hits = existing ? existing.hits.filter((t) => now - t < windowMs) : [];

    if (hits.length >= limit) {
        const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000));
        // 刷新顺序（LRU）并保留该桶自己的窗口过期时间
        buckets.delete(key);
        buckets.set(key, {
            hits,
            windowMs,
            expiresAt: hits[hits.length - 1] + windowMs,
        });
        return { ok: false, retryAfterSec };
    }

    hits.push(now);
    // 防止 Map 无限增长：按每个桶自身的 expiresAt 清理，必要时淘汰最老键保证硬容量上限
    if (!existing && buckets.size >= MAX_TRACKED_KEYS) {
        pruneBuckets(now, true);
        while (buckets.size >= MAX_TRACKED_KEYS) {
            const oldestKey = buckets.keys().next().value;
            if (oldestKey === undefined) break;
            buckets.delete(oldestKey);
        }
    }

    buckets.delete(key);
    buckets.set(key, {
        hits,
        windowMs,
        expiresAt: now + windowMs,
    });

    return { ok: true, retryAfterSec: 0 };
}

export function clientIp(request: Request): string {
    // 优先信任反向代理（nginx）覆写的 X-Real-IP；若只有 X-Forwarded-For，则取最右端代理追加的地址，
    // 避免客户端伪造最左端 X-Forwarded-For 绕过按 IP 限流。
    const realIp = request.headers.get('x-real-ip')?.trim();
    if (realIp) return realIp;
    const fwd = request.headers.get('x-forwarded-for');
    if (fwd) {
        const parts = fwd.split(',').map((s) => s.trim()).filter(Boolean);
        if (parts.length > 0) return parts[parts.length - 1];
    }
    return 'unknown';
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
