import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { isAlipayConfigured, queryOrder } from '@/lib/pay/alipay';
import { fulfillPaidOrder } from '@/lib/pay/fulfill';

export const runtime = 'nodejs';

const PAID_STATUSES = new Set(['TRADE_SUCCESS', 'TRADE_FINISHED']);

// 订单状态查询（仅本人）。异步通知可能延迟/丢失，pending 时主动查单兜底。
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ outTradeNo: string }> },
) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { outTradeNo } = await params;
    const order = await prisma.paymentOrder.findUnique({ where: { outTradeNo } });
    if (!order || order.userId !== session.id) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.status === 'pending' && isAlipayConfigured()) {
        const queried = await queryOrder(outTradeNo);
        if (
            queried &&
            queried.code === '10000' &&
            queried.outTradeNo === outTradeNo &&
            Boolean(queried.totalAmount) &&
            PAID_STATUSES.has(queried.tradeStatus || '')
        ) {
            await fulfillPaidOrder({
                outTradeNo,
                alipayTradeNo: queried.tradeNo,
                totalAmount: queried.totalAmount,
                raw: queried,
            });
        }
    }

    const fresh = await prisma.paymentOrder.findUnique({ where: { outTradeNo } });
    return NextResponse.json({
        status: fresh?.status ?? order.status,
        paidAt: fresh?.paidAt ?? null,
    });
}
