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

export type RecommendationReasonMeta =
    | { type: 'due_words'; count: number; words: string[] }
    | { type: 'cefr_match'; level: string }
    | { type: 'interest_match' }
    | { type: 'curated' }
    | { type: 'echostream' };

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
    recommendationReason: string; // 推荐解释文案 (XAI 可解释性，保留中文兼容字段)
    reasonMeta: RecommendationReasonMeta; // 结构化推荐依据，供前端按 locale 本地化渲染
}

const CEFR_ORDER: Record<string, number> = {
    A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6
};

// 单音节短 CVC 词（如 stop / hop / car / plan），加 -ed/-ing 时会双写尾辅音，避免 car 误匹配 caring
const SHORT_CVC_RE = /^[^aeiou]*[aeiou][bcdfghjklmnpqrstvz]$/;
// 以元音+单辅音结尾的多音节词（如 begin / prefer / visit）
const ENDING_VC_RE = /[aeiou][bcdfghjklmnpqrstvz]$/;
const DOUBLED_CONSONANT_RE = /([bcdfghjklmnpqrstvz])\1$/;

/** 从词元生成常见屈折变形（复数、第三人称单数、过去式、现在分词） */
function generateInflections(word: string): string[] {
    const forms = new Set<string>([word]);
    if (word.length < 3 || !/^[a-z]+$/.test(word)) return Array.from(forms);

    // 复数 / 三单
    if (/[^aeiou]y$/.test(word)) {
        const stem = word.slice(0, -1);
        forms.add(`${stem}ies`);
        forms.add(`${stem}ied`);
        forms.add(`${word}ing`);
    } else if (/(?:s|sh|ch|x|z|o)$/.test(word)) {
        forms.add(`${word}es`);
        forms.add(`${word}ed`);
        forms.add(`${word}ing`);
    } else if (word.endsWith('ie')) {
        forms.add(`${word}s`);
        forms.add(`${word}d`);
        forms.add(`${word.slice(0, -2)}ying`);
    } else if (word.endsWith('e')) {
        forms.add(`${word}s`);
        forms.add(`${word}d`);
        forms.add(`${word.slice(0, -1)}ing`);
        if (word.endsWith('fe') && word.length >= 4) {
            forms.add(`${word.slice(0, -2)}ves`);
        }
    } else {
        forms.add(`${word}s`);
        if (word.endsWith('f') && word.length >= 4) {
            forms.add(`${word.slice(0, -1)}ves`);
        }
        if (SHORT_CVC_RE.test(word)) {
            const last = word[word.length - 1];
            forms.add(`${word}${last}ed`);
            forms.add(`${word}${last}ing`);
        } else {
            forms.add(`${word}ed`);
            forms.add(`${word}ing`);
            if (ENDING_VC_RE.test(word) && !/[aeiou]{2}[bcdfghjklmnpqrstvz]$/.test(word)) {
                const last = word[word.length - 1];
                forms.add(`${word}${last}ed`);
                forms.add(`${word}${last}ing`);
            }
        }
    }

    return Array.from(forms);
}

/** 从可能是屈折形态的词提取候选原型，支持双向词形归一 */
function extractBaseCandidates(word: string): string[] {
    const bases = new Set<string>([word]);
    if (word.length < 4 || !/^[a-z]+$/.test(word)) return Array.from(bases);

    if (word.endsWith('ies') && word.length >= 5) {
        bases.add(`${word.slice(0, -3)}y`);
    } else if (word.endsWith('ied') && word.length >= 5) {
        bases.add(`${word.slice(0, -3)}y`);
    } else if (word.endsWith('ves') && word.length >= 5) {
        const stem = word.slice(0, -3);
        bases.add(`${stem}f`);
        bases.add(`${stem}fe`);
    } else if (word.endsWith('es') && word.length >= 5) {
        const stem = word.slice(0, -2);
        if (/(?:s|sh|ch|x|z|o)$/.test(stem)) {
            bases.add(stem);
        }
        bases.add(word.slice(0, -1));
    } else if (word.endsWith('s') && !word.endsWith('ss')) {
        bases.add(word.slice(0, -1));
    }

    if (word.endsWith('ed') && word.length >= 5) {
        const stem = word.slice(0, -2);
        if (DOUBLED_CONSONANT_RE.test(stem) && stem.length >= 4) {
            // 既保留原词尾双辅音（如 witnessed → witness / passed → pass / called → call），
            // 也还原屈折双写（如 stopped → stop / planned → plan）
            bases.add(stem);
            bases.add(stem.slice(0, -1));
        } else if (SHORT_CVC_RE.test(stem)) {
            bases.add(`${stem}e`);
        } else {
            bases.add(stem);
            if (!stem.endsWith('e')) bases.add(`${stem}e`);
        }
    }

    if (word.endsWith('ing') && word.length >= 5) {
        const stem = word.slice(0, -3);
        if (stem.endsWith('y') && word.length >= 5) {
            bases.add(`${stem.slice(0, -1)}ie`);
            if (stem.length >= 3) bases.add(stem);
        } else if (DOUBLED_CONSONANT_RE.test(stem) && stem.length >= 4) {
            bases.add(stem);
            bases.add(stem.slice(0, -1));
        } else if (SHORT_CVC_RE.test(stem)) {
            bases.add(`${stem}e`);
        } else if (stem.length >= 3) {
            bases.add(stem);
            if (!stem.endsWith('e')) bases.add(`${stem}e`);
        }
    }

    return Array.from(bases);
}

/** 计算单个文章的 6 维得分并归一化为 0~100 */
export function scoreArticleWithRmeV5(
    article: ArticleCandidate,
    profile: UserLearningProfile,
    weights: RmeV5Weights = DEFAULT_RME_V5_WEIGHTS
): RecommendationResult {
    // 1. Opportunity: 到期词命中率（精确匹配 + 常见英文词形变化归一）
    const articleWordSet = new Set(article.containedWords.map(w => w.toLowerCase()));
    const articleBaseSet = new Set<string>();
    for (const w of articleWordSet) {
        for (const base of extractBaseCandidates(w)) {
            articleBaseSet.add(base);
        }
    }

    const seenDue = new Set<string>();
    const uniqueDueWords: string[] = [];
    for (const w of profile.dueWords) {
        const lower = w.toLowerCase();
        if (!lower || seenDue.has(lower)) continue;
        seenDue.add(lower);
        uniqueDueWords.push(w);
    }

    const matchedDueWords = uniqueDueWords.filter((rawDue) => {
        const lower = rawDue.toLowerCase();
        if (articleWordSet.has(lower)) return true;
        for (const form of generateInflections(lower)) {
            if (articleWordSet.has(form)) return true;
        }
        for (const base of extractBaseCandidates(lower)) {
            if (articleWordSet.has(base) || articleBaseSet.has(base)) return true;
        }
        return false;
    });
    const dueCount = uniqueDueWords.length;
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

    // 生成 XAI 可解释性推荐理由（同时返回结构化 reasonMeta 供前端多语言渲染）
    let recommendationReason = '为你推荐的精选语境文章';
    let reasonMeta: RecommendationReasonMeta = { type: 'curated' };
    if (matchedDueWords.length > 0) {
        const previewWords = matchedDueWords.slice(0, 3);
        recommendationReason = `精准命中 ${matchedDueWords.length} 个待复习单词（如: ${previewWords.join(', ')}）`;
        reasonMeta = { type: 'due_words', count: matchedDueWords.length, words: previewWords };
    } else if (diffScore >= 0.95) {
        const level = profile.userCefr || 'B1';
        recommendationReason = `完美契合你的 ${level} 难度梯队`;
        reasonMeta = { type: 'cefr_match', level };
    } else if (interestScore >= 0.9) {
        recommendationReason = `符合你的主题偏好与兴趣`;
        reasonMeta = { type: 'interest_match' };
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
        reasonMeta,
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
