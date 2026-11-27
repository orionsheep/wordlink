/**
 * 连续学习天数的统一口径：主界面、打卡日历和学习护照共用，三处显示的数字必须一致。
 * 有测验或浏览记录的一天算活跃；日期按服务器时区分桶（与各页面「今天」的边界一致）。
 */

/** 服务器时区，SQL 里按它把 timestamp 分桶成本地日期 */
export const SERVER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** 打卡接口按日聚合时的回看窗口天数（主界面与护照直接查全量去重活跃日期，不受窗口截断） */
export const STREAK_WINDOW_DAYS = 400;

export function streakWindowStart(now = new Date()): Date {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - STREAK_WINDOW_DAYS);
    return start;
}

/**
 * 当前运行环境的本地日期 YYYY-MM-DD：服务端即服务器时区，与 SQL 的
 * to_char(... AT TIME ZONE SERVER_TZ, 'YYYY-MM-DD') 对应；在浏览器里就是用户本地日期
 */
export function localDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 从今天往前数连续的活跃天。今天还没学不算断：截至昨天的连续天数照常显示 */
export function streakFromDays(activeDays: Set<string>, now = new Date()): number {
    // 锚定在本地中午 12:00，避免跨夏令时切换日时按天回退产生日期偏移
    const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    if (!activeDays.has(localDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (activeDays.has(localDateStr(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}
