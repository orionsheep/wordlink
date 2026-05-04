import { NextResponse } from 'next/server';

// 允许的源列表
const ALLOWED_ORIGINS = [
  'https://wordlink.lifeplayertribe.com',
  'https://echostream.lifeplayertribe.com', // 阅读平台域名
  'http://localhost:3000', // 本地开发
  'http://localhost:3001', // 本地开发
  'http://localhost:5173', // 本地开发 (Vite)
  'http://localhost:8080', // 本地开发
];

export function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
    'Access-Control-Max-Age': '86400', // 24小时
  };

  // 检查origin是否在允许列表中
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return headers;
}

export function handleCorsPreflightRequest(request: Request): NextResponse {
  const origin = request.headers.get('origin');
  const headers = getCorsHeaders(origin);
  return NextResponse.json({}, { status: 200, headers });
}

export function addCorsHeaders(response: NextResponse, origin: string | null): NextResponse {
  const corsHeaders = getCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value as string);
  });
  return response;
}
