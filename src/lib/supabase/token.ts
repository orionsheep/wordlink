// Helpers for reading the Supabase access token directly from request cookies
// and inspecting its expiry. Used by both edge middleware and Node route
// handlers — must stay free of Node-only APIs (no fs/crypto, atob only).

const AUTH_COOKIE_PATTERN = /^sb-.+-auth-token(\.\d+)?$/;

export function hasAuthCookie(cookies: { name: string }[]): boolean {
    return cookies.some((c) => AUTH_COOKIE_PATTERN.test(c.name));
}

function decodeCookieValue(raw: string): string {
    let value = raw;
    if (value.startsWith('base64-')) {
        try {
            value = atob(value.slice('base64-'.length));
        } catch {
            return raw;
        }
    }
    try {
        value = decodeURIComponent(value);
    } catch {
        // keep the raw value
    }
    return value;
}

/**
 * Reassemble the (possibly chunked) sb-*-auth-token cookie and pull out the
 * access token. Returns null when no usable session cookie is present.
 */
export function extractAccessToken(
    cookies: { name: string; value: string }[],
): string | null {
    const chunks = cookies
        .filter((c) => AUTH_COOKIE_PATTERN.test(c.name))
        .sort((a, b) => {
            const idx = (n: string) => {
                const m = n.match(/\.(\d+)$/);
                return m ? Number(m[1]) : 0;
            };
            return idx(a.name) - idx(b.name);
        });
    if (chunks.length === 0) return null;

    const decoded = decodeCookieValue(chunks.map((c) => c.value).join(''));
    try {
        const parsed = JSON.parse(decoded);
        if (typeof parsed?.access_token === 'string') return parsed.access_token;
        // Some storage versions double-encode the session JSON
        if (typeof parsed === 'string') {
            const inner = JSON.parse(parsed);
            if (typeof inner?.access_token === 'string') return inner.access_token;
        }
    } catch {
        return null;
    }
    return null;
}

/**
 * Read the `exp` claim (seconds since epoch) from a JWT without verifying the
 * signature. Only used to decide whether a refresh round-trip is needed —
 * actual authentication still happens server-side via Supabase.
 */
export function getJwtExpiry(token: string): number | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64));
        return typeof payload?.exp === 'number' ? payload.exp : null;
    } catch {
        return null;
    }
}
