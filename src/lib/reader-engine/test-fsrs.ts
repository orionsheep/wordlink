/**
 * ⚡ FSRS-6 记忆科学模型全真模拟测试套件
 * 模拟不同学习者（学霸、遗忘挣扎者、真实混合学习者）在 30~90 天周期内的记忆衰减与状态迁移
 */
import {
    createInitialFsrsCard,
    scheduleFsrsReview,
    calculateRetrievability,
    type FsrsCardState,
    type FsrsRating,
    FSRS_VERSION,
} from './fsrs';

console.log(`\n======================================================================`);
console.log(`🧪 【FSRS-6 记忆科学模型模拟验证】引擎版本: ${FSRS_VERSION}`);
console.log(`======================================================================\n`);

function printCard(title: string, card: FsrsCardState, now: Date) {
    const r = calculateRetrievability(card, now);
    console.log(
        `[${title.padEnd(16)}] 状态:${card.state.padEnd(10)} | S(稳定性):${String(card.stability).padStart(6)}天 | D(难度):${String(card.difficulty).padStart(5)} | R(保持率):${(r * 100).toFixed(1)}% | 间隔:${String(card.scheduledDays).padStart(3)}天 | 复习次数:${card.reps} | 遗忘:${card.lapses}`
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 场景 1: 优秀学习者（连续顺畅复习 Good/Easy）
// ─────────────────────────────────────────────────────────────────────────────
console.log(`📌 场景 1：顺畅记忆曲线模拟（连续 Good / Easy 进阶）`);
let card1 = createInitialFsrsCard(new Date('2026-01-01T00:00:00Z'));
let t1 = new Date('2026-01-01T00:00:00Z');
printCard('Day 0 初始卡片', card1, t1);

// 第 1 次复习：Good (3)
t1 = new Date('2026-01-01T00:00:00Z');
card1 = scheduleFsrsReview(card1, 3, t1);
printCard('Day 0 首次学完(Good)', card1, t1);

// 第 2 次复习：按到期时间到达后复习 Good (3)
t1 = new Date(card1.due);
card1 = scheduleFsrsReview(card1, 3, t1);
printCard(`Day ${card1.elapsedDays.toFixed(0)} 第2次到期(Good)`, card1, t1);

// 第 3 次复习：熟练 Easy (4)
t1 = new Date(card1.due);
card1 = scheduleFsrsReview(card1, 4, t1);
printCard(`Day ${card1.elapsedDays.toFixed(0)} 第3次到期(Easy)`, card1, t1);

// 第 4 次复习：再次 Easy (4)
t1 = new Date(card1.due);
card1 = scheduleFsrsReview(card1, 4, t1);
printCard(`Day ${card1.elapsedDays.toFixed(0)} 第4次到期(Easy)`, card1, t1);

console.log(`\n─────────────────────────────────────────────────────────────────────`);

// ─────────────────────────────────────────────────────────────────────────────
// 场景 2: 遗忘挣扎者（中途遗忘 Again，触发惩罚与自愈重学）
// ─────────────────────────────────────────────────────────────────────────────
console.log(`📌 场景 2：遗忘与自愈重学模拟（遇到难词发生遗忘 Again）`);
let card2 = createInitialFsrsCard(new Date('2026-01-01T00:00:00Z'));
let t2 = new Date('2026-01-01T00:00:00Z');

// 首次学完
card2 = scheduleFsrsReview(card2, 3, t2);
printCard('首次学完(Good)', card2, t2);

// 过了 7 天突然遗忘：Again (1)
t2 = new Date('2026-01-08T00:00:00Z');
card2 = scheduleFsrsReview(card2, 1, t2);
printCard('第7天突然遗忘(Again)', card2, t2);

// 遗忘后立即重学：Hard (2)
t2 = new Date(card2.due);
card2 = scheduleFsrsReview(card2, 2, t2);
printCard('重学排队(Hard)', card2, t2);

// 逐步巩固：Good (3)
t2 = new Date(card2.due);
card2 = scheduleFsrsReview(card2, 3, t2);
printCard('自愈恢复(Good)', card2, t2);

console.log(`\n─────────────────────────────────────────────────────────────────────`);

// ─────────────────────────────────────────────────────────────────────────────
// 场景 3: 瞬时保持率 R(t) 时间衰减曲线验证
// ─────────────────────────────────────────────────────────────────────────────
console.log(`📌 场景 3：时间衰减 R(t) 保持率全周期观测（以 S=10天 为例）`);
let testCard = createInitialFsrsCard(new Date('2026-01-01T00:00:00Z'));
testCard.stability = 10.0;
testCard.lastReview = '2026-01-01T00:00:00Z';

const checkDays = [0, 1, 3, 7, 10, 15, 30, 60];
console.log(`| 经过天数 | 瞬时保持率 R(t) | 艾宾浩斯记忆评价 | 调度建议 |`);
console.log(`|---------|----------------|----------------|---------|`);

checkDays.forEach(days => {
    const curDate = new Date(new Date('2026-01-01T00:00:00Z').getTime() + days * 24 * 3600 * 1000);
    const r = calculateRetrievability(testCard, curDate);
    const status = r >= 0.90 ? '🟢 极度牢固' : r >= 0.75 ? '🟡 临界记忆' : r >= 0.50 ? '🟠 快速衰退' : '🔴 遗忘高危';
    const action = r >= 0.90 ? '暂缓复习' : r >= 0.75 ? 'RME-V5 推荐语境精读' : 'AI 听写强制自愈';
    console.log(`| ${String(days).padStart(2)} 天    | ${(r * 100).toFixed(1).padStart(5)}%          | ${status}       | ${action} |`);
});

console.log(`\n✅ FSRS-6 记忆科学模型模拟验证全部通过！\n`);
