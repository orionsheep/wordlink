import { prisma } from '@/lib/prisma';
import { invalidateAuthCaches } from '@/lib/auth';
import { getProduct } from './products';

export type FulfillResult = 'paid' | 'already_paid' | 'amount_mismatch' | 'unknown_product' | 'not_found';

function toCents(amount: unknown): number | null {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
}

// 支付成功后的开通/续期：先原子抢占订单状态（幂等），再在事务内锁住用户行叠加时长，
// 防止同一用户两笔不同订单并发回调时互相覆盖 planExpiresAt。
// 被异步通知（/api/pay/notify）与主动查单兜底（GET /api/pay/orders/[outTradeNo]）共用。
export async function fulfillPaidOrder(input: {
    outTradeNo: string;
    alipayTradeNo?: string;
    totalAmount?: string;
    raw?: unknown;
}): Promise<FulfillResult> {
    const order = await prisma.paymentOrder.findUnique({
        where: { outTradeNo: input.outTradeNo },
    });
    if (!order) return 'not_found';
    if (order.status === 'paid') return 'already_paid';

    const product = getProduct(order.product);
    if (!product) return 'unknown_product';

    // 金额必须存在且按分精确匹配，缺省或非法金额一律拒绝履约
    const paidCents = input.totalAmount ? toCents(input.totalAmount) : null;
    const expectedCents = toCents(order.amount);
    if (paidCents === null || expectedCents === null || paidCents !== expectedCents) {
        return 'amount_mismatch';
    }

    const now = new Date();
    let claimed = false;
    await prisma.$transaction(async (tx) => {
        const claim = await tx.paymentOrder.updateMany({
            where: { outTradeNo: order.outTradeNo, status: 'pending' },
            data: {
                status: 'paid',
                alipayTradeNo: input.alipayTradeNo ?? null,
                paidAt: now,
                rawNotify: input.raw === undefined ? undefined : (input.raw as object),
            },
        });
        if (claim.count === 0) return; // 并发回调已处理
        claimed = true;

        // 行级锁串行化同一用户的多订单并发续期，避免 READ COMMITTED 下后写覆盖前写
        const lockedRows = await tx.$queryRaw<Array<{ planExpiresAt: Date | null }>>`
            SELECT "planExpiresAt"
            FROM "LPT_english"."User"
            WHERE "id" = ${order.userId}
            FOR UPDATE
        `;
        const currentExpiresAt = lockedRows[0]?.planExpiresAt ?? null;
        const base = currentExpiresAt && currentExpiresAt > now ? currentExpiresAt : now;
        const planExpiresAt = new Date(base.getTime() + product.days * 86_400_000);
        await tx.user.update({
            where: { id: order.userId },
            data: { plan: 'pro', planExpiresAt },
        });
    });

    if (!claimed) return 'already_paid';
    invalidateAuthCaches(order.userId);
    return 'paid';
}
