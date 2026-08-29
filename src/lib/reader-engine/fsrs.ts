/**
 * ⚡ FSRS-6 (Free Spaced Repetition Scheduler v6) 纯函数记忆模型
 *
 * 核心指标：
 * - S (Stability): 记忆稳定性（天数），即保持率降至 90% 所需时间
 * - D (Difficulty): 难度评级 (1~10)
 * - R(t) (Retrievability): 瞬时保持率（遗忘概率衰减模型）
 * - Grade (Rating): 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
 */

export const FSRS_VERSION = 'FSRS-6.0' as const;

export type FsrsRating = 1 | 2 | 3 | 4; // 1: Again, 2: Hard, 3: Good, 4: Easy

export interface FsrsCardState {
    stability: number;       // S >= 0.1
    difficulty: number;      // 1 <= D <= 10
    elapsedDays: number;     // 距上次复习天数
    scheduledDays: number;   // 下次推荐复习间隔天数
    reps: number;            // 总复习次数
    lapses: number;          // 遗忘次数 (Rating == 1)
    lastReview?: string;     // ISO String
    due: string;             // ISO String
    state: 'new' | 'learning' | 'review' | 'relearning';
}

/** 默认初始卡片状态 */
export function createInitialFsrsCard(now = new Date()): FsrsCardState {
    return {
        stability: 1.0,
        difficulty: 5.0,
        elapsedDays: 0,
        scheduledDays: 1,
        reps: 0,
        lapses: 0,
        lastReview: undefined,
        due: now.toISOString(),
        state: 'new',
    };
}

/** FSRS-6 默认权重常量 */
const W = [
    0.40255, 1.18385, 3.173, 15.69105, // w0..w3: Initial stability for ratings 1..4
    7.1949, 0.5345,                     // w4..w5: Initial difficulty params
    1.4604, 0.0046,                     // w6..w7: Difficulty update params
    1.54575, 0.1192, 1.01925,           // w8..w10: Stability update on Good/Easy
    1.9395, 0.11, 0.29605, 0.22695,     // w11..w14: Stability update on Again/Hard
    0.2272, 2.8555,                     // w15..w16: Retrievability weighting
    0.5052, 0.28,                       // w17..w18
];

const REQUEST_RETENTION = 0.90; // 目标保持率 90%
const FACTOR = 19 / 81;         // (1/0.9 - 1) / 9 常数

/** 计算瞬时保持率 R(t) */
export function calculateRetrievability(card: FsrsCardState, now = new Date()): number {
    if (!card.lastReview || card.stability <= 0) return 0.9;
    const elapsedDays = Math.max(0, (now.getTime() - new Date(card.lastReview).getTime()) / (1000 * 60 * 60 * 24));
    // R(t) = (1 + factor * t / S)^(-0.5)
    const r = Math.pow(1 + (FACTOR * elapsedDays) / Math.max(0.1, card.stability), -0.5);
    return Math.min(1.0, Math.max(0.01, r));
}

/** 核心调度状态迁移（纯函数） */
export function scheduleFsrsReview(card: FsrsCardState, rating: FsrsRating, now = new Date()): FsrsCardState {
    const isFirst = card.reps === 0 || !card.lastReview;
    const elapsedDays = isFirst
        ? 0
        : Math.max(0, (now.getTime() - new Date(card.lastReview!).getTime()) / (1000 * 60 * 60 * 24));

    let nextS: number;
    let nextD: number;
    let nextState = card.state;
    let lapses = card.lapses;

    if (isFirst) {
        // 初次学习
        nextS = Math.max(0.1, W[rating - 1]);
        nextD = Math.min(10, Math.max(1, W[4] - Math.exp(W[5] * (rating - 1)) + 1));
        nextState = rating === 1 ? 'relearning' : 'review';
        if (rating === 1) lapses += 1;
    } else {
        const retrievability = calculateRetrievability(card, now);
        // 难度更新：D' = D - w6 * (rating - 3)，并引入均值回归
        const meanD = W[4];
        const rawD = card.difficulty - W[6] * (rating - 3);
        nextD = Math.min(10, Math.max(1, W[7] * meanD + (1 - W[7]) * rawD));

        if (rating === 1) {
            // Again: 遗忘重学
            nextS = Math.max(0.1, W[11] * Math.pow(card.difficulty, -W[12]) * (Math.pow(card.stability + 1, W[13]) - 1) * Math.exp((1 - retrievability) * W[14]));
            nextState = 'relearning';
            lapses += 1;
        } else {
            // Hard / Good / Easy: 成功回忆
            const hardPenalty = rating === 2 ? W[15] : 1;
            const easyBonus = rating === 4 ? W[16] : 1;
            nextS = Math.max(
                card.stability * 1.05,
                card.stability * (1 + Math.exp(W[8]) * (11 - nextD) * Math.pow(card.stability, -W[9]) * (Math.exp((1 - retrievability) * W[10]) - 1) * hardPenalty * easyBonus)
            );
            nextState = 'review';
        }
    }

    // 根据目标保持率 90% 计算下次推荐天数
    const scheduledDays = Math.max(1, Math.round((nextS / FACTOR) * (Math.pow(REQUEST_RETENTION, -2) - 1)));
    const dueTime = new Date(now.getTime() + scheduledDays * 24 * 60 * 60 * 1000);

    return {
        stability: Number(nextS.toFixed(3)),
        difficulty: Number(nextD.toFixed(3)),
        elapsedDays: Number(elapsedDays.toFixed(2)),
        scheduledDays,
        reps: card.reps + 1,
        lapses,
        lastReview: now.toISOString(),
        due: dueTime.toISOString(),
        state: nextState,
    };
}
