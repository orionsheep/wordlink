import crypto from 'node:crypto';

// 支付宝「电脑网站支付」alipay.trade.page.pay + 异步通知验签 + 主动查单。
// 只依赖 node:crypto 的 RSA2(SHA256withRSA) 签名/验签，不引第三方支付 SDK。

const DEFAULT_GATEWAY = 'https://openapi.alipay.com/gateway.do';

interface AlipayEnv {
    appId: string;
    privateKey: string;
    publicKey: string;
    gateway: string;
    notifyUrl: string;
    returnUrl: string;
    sellerId: string;
}

function alipayEnv(): AlipayEnv {
    return {
        appId: process.env.ALIPAY_APP_ID || '',
        privateKey: process.env.ALIPAY_PRIVATE_KEY || '',
        publicKey: process.env.ALIPAY_PUBLIC_KEY || '',
        gateway: process.env.ALIPAY_GATEWAY || DEFAULT_GATEWAY,
        notifyUrl: process.env.ALIPAY_NOTIFY_URL || '',
        returnUrl: process.env.ALIPAY_RETURN_URL || '',
        sellerId: process.env.ALIPAY_SELLER_ID || '',
    };
}

export function isAlipayConfigured(): boolean {
    const { appId, privateKey, publicKey } = alipayEnv();
    return Boolean(appId && privateKey && publicKey);
}

// env 里的密钥常见两种形态：带 PEM 头尾（\n 可能被转义成字面 \\n）或裸 base64
function toPem(key: string, type: 'PRIVATE KEY' | 'RSA PRIVATE KEY' | 'PUBLIC KEY'): string {
    let normalized = key.trim().replace(/\\n/g, '\n').replace(/\r/g, '');
    if (!normalized.includes('BEGIN')) {
        normalized = `-----BEGIN ${type}-----\n${normalized}\n-----END ${type}-----`;
    }
    return normalized;
}

function signRSA2(content: string, privateKey: string): string {
    try {
        return crypto
            .createSign('RSA-SHA256')
            .update(content, 'utf8')
            .sign(toPem(privateKey, 'PRIVATE KEY'), 'base64');
    } catch {
        // 裸 base64 若实为 PKCS1，会被误包成 PKCS8 头导致解码失败，退回 PKCS1 头再试
        return crypto
            .createSign('RSA-SHA256')
            .update(content, 'utf8')
            .sign(toPem(privateKey, 'RSA PRIVATE KEY'), 'base64');
    }
}

type AlipayParams = Record<string, string>;

// 字典序拼接 key=value&...，剔除空值（sign/sign_type 由调用方决定是否先排除）
function buildSignContent(params: AlipayParams): string {
    return Object.keys(params)
        .sort()
        .filter((k) => params[k] !== undefined && params[k] !== '')
        .map((k) => `${k}=${params[k]}`)
        .join('&');
}

// 支付宝要求北京时间（GMT+8）。服务器不一定在东八区，按 UTC+8 换算（中国没有夏令时）
function timestamp(d = new Date()): string {
    const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${bj.getUTCFullYear()}-${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())} ${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`;
}

function publicParams(method: string, bizContent: Record<string, unknown>): AlipayParams {
    const env = alipayEnv();
    const params: AlipayParams = {
        app_id: env.appId,
        method,
        charset: 'utf-8',
        sign_type: 'RSA2',
        timestamp: timestamp(),
        version: '1.0',
        biz_content: JSON.stringify(bizContent),
    };
    if (env.notifyUrl) params.notify_url = env.notifyUrl;
    if (env.returnUrl) params.return_url = env.returnUrl;
    return params;
}

export function buildPagePayUrl(input: {
    outTradeNo: string;
    totalAmount: string;
    subject: string;
}): string {
    const env = alipayEnv();
    const params = publicParams('alipay.trade.page.pay', {
        out_trade_no: input.outTradeNo,
        product_code: 'FAST_INSTANT_TRADE_PAY',
        total_amount: input.totalAmount,
        subject: input.subject,
    });
    params.sign = signRSA2(buildSignContent(params), env.privateKey);
    const query = Object.keys(params)
        .map((k) => `${k}=${encodeURIComponent(params[k])}`)
        .join('&');
    return `${env.gateway}?${query}`;
}

export function verifyNotify(params: Record<string, string>): boolean {
    const env = alipayEnv();
    const receivedSign = params.sign;
    if (!receivedSign || params.sign_type !== 'RSA2') return false;

    const rest = { ...params };
    delete rest.sign;
    delete rest.sign_type;

    try {
        const ok = crypto
            .createVerify('RSA-SHA256')
            .update(buildSignContent(rest), 'utf8')
            .verify(toPem(env.publicKey, 'PUBLIC KEY'), receivedSign, 'base64');
        if (!ok) return false;
    } catch {
        return false;
    }

    if (!env.appId || params.app_id !== env.appId) return false;
    if (env.sellerId && params.seller_id !== env.sellerId) return false;
    return true;
}

export interface AlipayQueryResult {
    code: string;
    msg: string;
    tradeStatus?: string;
    tradeNo?: string;
    outTradeNo?: string;
    totalAmount?: string;
}

/**
 * 从支付宝网关原始 JSON 字符串中提取指定响应节点的精确子串用于 RSA2 验签。
 * 支付宝同步网关响应按原始 JSON 节点字节序列签名，不能用 JSON.stringify 重序列化。
 */
function extractJsonNodeRaw(rawText: string, nodeName: string): string | null {
    const keyToken = `"${nodeName}"`;
    const keyIdx = rawText.indexOf(keyToken);
    if (keyIdx === -1) return null;
    const colonIdx = rawText.indexOf(':', keyIdx + keyToken.length);
    if (colonIdx === -1) return null;

    let start = colonIdx + 1;
    while (start < rawText.length && /\s/.test(rawText[start])) start += 1;
    if (rawText[start] !== '{') return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < rawText.length; i += 1) {
        const ch = rawText[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
        } else if (ch === '{') {
            depth += 1;
        } else if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                return rawText.slice(start, i + 1);
            }
        }
    }
    return null;
}

function verifyGatewayResponseSign(rawText: string, nodeName: string, sign: unknown, publicKey: string): boolean {
    if (typeof sign !== 'string' || !sign || !publicKey) return false;
    const nodeRaw = extractJsonNodeRaw(rawText, nodeName);
    if (!nodeRaw) return false;

    const pem = toPem(publicKey, 'PUBLIC KEY');
    const verifyRaw = (content: string) => {
        try {
            return crypto
                .createVerify('RSA-SHA256')
                .update(content, 'utf8')
                .verify(pem, sign, 'base64');
        } catch {
            return false;
        }
    };

    if (verifyRaw(nodeRaw)) return true;
    // 支付宝网关在 JSON 中可能将 `/` 转义为 `\/`，官方 SDK 会在首次失败后还原再验一次
    if (nodeRaw.includes('\\/')) {
        return verifyRaw(nodeRaw.replace(/\\\//g, '/'));
    }
    return false;
}

export async function queryOrder(outTradeNo: string): Promise<AlipayQueryResult | null> {
    const env = alipayEnv();
    if (!isAlipayConfigured()) return null;

    try {
        const params = publicParams('alipay.trade.query', { out_trade_no: outTradeNo });
        delete params.notify_url;
        delete params.return_url;
        params.sign = signRSA2(buildSignContent(params), env.privateKey);

        const res = await fetch(env.gateway, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params).toString(),
            // 订单状态接口在请求里同步查单，网关卡住时不能把用户的轮询一起挂住
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return null;

        const rawText = await res.text();
        const json = JSON.parse(rawText);
        const r = json?.alipay_trade_query_response;
        if (!r || typeof r !== 'object') return null;

        if (!verifyGatewayResponseSign(rawText, 'alipay_trade_query_response', json?.sign, env.publicKey)) {
            console.error('[alipay] queryOrder signature verification failed:', outTradeNo);
            return null;
        }

        return {
            code: String(r.code ?? ''),
            msg: String(r.msg ?? ''),
            tradeStatus: r.trade_status ? String(r.trade_status) : undefined,
            tradeNo: r.trade_no ? String(r.trade_no) : undefined,
            outTradeNo: r.out_trade_no ? String(r.out_trade_no) : undefined,
            totalAmount: r.total_amount ? String(r.total_amount) : undefined,
        };
    } catch (error) {
        console.error('[alipay] queryOrder failed:', error);
        return null;
    }
}
