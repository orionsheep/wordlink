/**
 * ⚡ RME-V5 (Reading Memory Engine v5) 6维多目标文章推荐排序器
 *
 * 核心命题：“下一篇文章，就是你的单词复习”
 *
 * 6维归一化评分特征：
 * 1. Opportunity (0.28): 到期/临界复习生词命中率（核心）
 * 2. Interest (0.24): 主题偏好匹配
 * 3. Difficulty (0.15): CEFR 等级适配度 (|UserCEFR - ArticleCEFR|)
 * 4. Goal (0.18): 考试目标标签适配 (CET4, 考研, 托福, 雅思)
 * 5. Novelty (0.08): 主题多样性与防审美疲劳
 * 6. Length (0.07): 篇幅阅读时长匹配
 */

export interface RmeV5Weights {
    opportunity: number;
    interest: number;
    difficulty: number;
    goal: number;
    novelty: number;
    length: number;
}

export const DEFAULT_RME_V5_WEIGHTS: RmeV5Weights = {
    opportunity: 0.28,
    interest: 0.24,
    difficulty: 0.15,
    goal: 0.18,
    novelty: 0.08,
    length: 0.07,
};

export interface UserLearningProfile {
    userCefr?: string;            // A1, A2, B1, B2, C1, C2
    targetExam?: string;          // 'CET4' | 'CET6' | 'KY' | 'TOEFL' | 'IELTS' | 'GENERAL'
    preferredTopics?: string[];   // ['nature', 'technology', 'philosophy']
    recentArticleIds?: string[];  // 最近读过的文章 id
    recentTopics?: string[];      // 最近读过的主题
    dueWords: string[];           // 当前遗忘临界区到期词列表
}

export interface ArticleCandidate {
    id: string;
    title: string;
    titleZh?: string;
    season?: string;
    category?: string;
    level?: string;               // A2, B1, B2, C1
    tags?: string[];
    wordCount?: number;
    containedWords: string[];     // 文章包含的核心词汇集 (lowercase)
}

export interface RecommendationResult {
    articleId: string;
    totalScore: number;          // 0 ~ 100
    matchedDueWords: string[];    // 本篇命中的到期复习词
    featureScores: {
        opportunity: number;     // 0 ~ 1
        interest: number;        // 0 ~ 1
        difficulty: number;      // 0 ~ 1
        goal: number;            // 0 ~ 1
        novelty: number;         // 0 ~ 1
        length: number;          // 0 ~ 1
    };
    recommendationReason: string; // 推荐解释文案 (XAI 可解释性)
}

const CEFR_ORDER: Record<string, number> = {
    A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6
};

/** 计算单个文章的 6 维得分并归一化为 0~100 */
export function scoreArticleWithRmeV5(
    article: ArticleCandidate,
    profile: UserLearningProfile,
    weights: RmeV5Weights = DEFAULT_RME_V5_WEIGHTS
): RecommendationResult {
    // 1. Opportunity: 到期词命中率
    const articleWordSet = new Set(article.containedWords.map(w => w.toLowerCase()));
    const matchedDueWords = profile.dueWords.filter(w => articleWordSet.has(w.toLowerCase()));
    const dueCount = profile.dueWords.length;
    const oppScore = dueCount > 0
        ? Math.min(1.0, matchedDueWords.length / Math.min(5, Math.max(1, dueCount)))
        : 0.5;

    // 2. Interest: 主题匹配
    let interestScore = 0.5;
    if (profile.preferredTopics && profile.preferredTopics.length > 0) {
        const artTopic = (article.category || article.season || '').toLowerCase();
        const hit = profile.preferredTopics.some(t => artTopic.includes(t.toLowerCase()));
        interestScore = hit ? 1.0 : 0.3;
    }

    // 3. Difficulty: CEFR 等级适配（阶梯差异递减）
    let diffScore = 0.8;
    if (profile.userCefr && article.level) {
        const uRank = CEFR_ORDER[profile.userCefr.toUpperCase()] || 3;
        const aRank = CEFR_ORDER[article.level.toUpperCase()] || 3;
        const delta = Math.abs(uRank - aRank);
        if (delta === 0) diffScore = 1.0;
        else if (delta === 1) diffScore = 0.85;
        else if (delta === 2) diffScore = 0.5;
        else diffScore = 0.2;
    }

    // 4. Goal: 考试目标与标签加权
    let goalScore = 0.6;
    if (profile.targetExam && article.tags) {
        const exam = profile.targetExam.toLowerCase();
        const hitTag = article.tags.some(t => t.toLowerCase().includes(exam));
        goalScore = hitTag ? 1.0 : 0.5;
    }

    // 5. Novelty: 新鲜度（近读主题降权防审美疲劳）
    let noveltyScore = 1.0;
    if (profile.recentTopics && profile.recentTopics.length > 0) {
        const curTopic = (article.category || article.season || '').toLowerCase();
        const count = profile.recentTopics.filter(t => t.toLowerCase() === curTopic).length;
        if (count >= 2) noveltyScore = 0.3;
        else if (count === 1) noveltyScore = 0.7;
    }
    if (profile.recentArticleIds && profile.recentArticleIds.includes(article.id)) {
        noveltyScore = 0.05; // 最近已读文章大幅降权
    }

    // 6. Length: 篇幅舒适度 (推荐 100~300 词)
    const wc = article.wordCount || 150;
    let lengthScore = 1.0;
    if (wc < 50) lengthScore = 0.4;
    else if (wc > 500) lengthScore = 0.6;
    else lengthScore = 0.95;

    // 综合加权总分
    const sumW = weights.opportunity + weights.interest + weights.difficulty + weights.goal + weights.novelty + weights.length;
    const rawScore = (
        oppScore * weights.opportunity +
        interestScore * weights.interest +
        diffScore * weights.difficulty +
        goalScore * weights.goal +
        noveltyScore * weights.novelty +
        lengthScore * weights.length
    ) / (sumW || 1);

    const totalScore = Math.round(Math.min(100, Math.max(0, rawScore * 100)));

    // 生成 XAI 可解释性推荐理由
    let recommendationReason = '为你推荐的精选语境文章';
    if (matchedDueWords.length > 0) {
        recommendationReason = `精准命中 ${matchedDueWords.length} 个待复习单词（如: ${matchedDueWords.slice(0, 3).join(', ')}）`;
    } else if (diffScore >= 0.95) {
        recommendationReason = `完美契合你的 ${profile.userCefr || 'B1'} 难度梯队`;
    } else if (interestScore >= 0.9) {
        recommendationReason = `符合你的主题偏好与兴趣`;
    }

    return {
        articleId: article.id,
        totalScore,
        matchedDueWords,
        featureScores: {
            opportunity: oppScore,
            interest: interestScore,
            difficulty: diffScore,
            goal: goalScore,
            novelty: noveltyScore,
            length: lengthScore,
        },
        recommendationReason,
    };
}

/** 对候选文库进行全量排序 */
export function rankArticlesWithRmeV5(
    articles: ArticleCandidate[],
    profile: UserLearningProfile,
    weights?: RmeV5Weights
): RecommendationResult[] {
    return articles
        .map(a => scoreArticleWithRmeV5(a, profile, weights))
        .sort((a, b) => b.totalScore - a.totalScore);
}
