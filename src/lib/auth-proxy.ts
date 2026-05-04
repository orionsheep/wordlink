import { NextResponse } from 'next/server';

export const AUTH_API_BASE =
  process.env.AUTH_API_BASE || 'https://auth.lifeplayertribe.com/api/v1';

function isHttpRequest(request: Request) {
  try {
    const url = new URL(request.url);
    return url.protocol === 'http:';
  } catch {
    return false;
  }
}

function rewriteSetCookie(setCookie: string, isHttp: boolean) {
  // Always strip Domain so the cookie binds to the current hostname
  let result = setCookie.replace(/;\s*Domain=[^;]+/gi, '');
  // Strip Secure on plain HTTP (e.g. localhost or IP access)
  if (isHttp) result = result.replace(/;\s*Secure/gi, '');
  // Ensure SameSite is present (iOS Safari requires it)
  if (!/SameSite=/i.test(result)) result += '; SameSite=Lax';
  return result;
}

export function appendAuthSetCookies(
  response: NextResponse,
  authResponse: Response,
  request: Request
) {
  const headers = authResponse.headers as Headers & {
    getSetCookie?: () => string[];
  };

  const upstreamSetCookies =
    typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  const cookiesToForward =
    upstreamSetCookies.length > 0
      ? upstreamSetCookies
      : (() => {
          const singleCookie = authResponse.headers.get('set-cookie');
          return singleCookie ? [singleCookie] : [];
        })();

  if (cookiesToForward.length === 0) {
    return;
  }

  const isHttp = isHttpRequest(request);
  for (const cookie of cookiesToForward) {
    response.headers.append('Set-Cookie', rewriteSetCookie(cookie, isHttp));
  }
}

export function getRequestCookieHeader(request: Request) {
  return request.headers.get('cookie') || '';
}
