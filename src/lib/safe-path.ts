/**
 * 把来自 URL 参数的跳转目标收窄成站内路径，否则返回 fallback（前后端都可用）。
 * 只看前缀不够：浏览器把 "/\evil.com"、"/<Tab>/evil.com" 和 "/.//evil.com" 规范化后
 * 都会解析为协议相对外链 "//evil.com"。这里解析并二次校验规范化结果必须仍为站内单斜杠路径。
 */
export function safeReturnPath(value: string | null | undefined, fallback = '/home'): string {
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
        return fallback;
    }
    try {
        const base = 'http://localhost';
        const url = new URL(value, base);
        if (url.origin !== base) return fallback;
        if (!url.pathname.startsWith('/') || url.pathname.startsWith('//')) return fallback;

        const normalized = `${url.pathname}${url.search}${url.hash}`;
        // 二次解析验证：防止第一次规范化后变成 //evil.example 而在后续 new URL(nextPath, req.url) 中跳出本站
        const reparsed = new URL(normalized, base);
        if (reparsed.origin !== base || reparsed.pathname.startsWith('//')) {
            return fallback;
        }
        return normalized;
    } catch {
        return fallback;
    }
}
