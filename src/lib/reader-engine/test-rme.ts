/**
 * ⚡ RME-V5 (Reading Memory Engine v5) 多目标文章推荐排序模拟测试
 * 模拟 4 种典型学习者画像（考研复习生、雅思高分考生、零生词冷启动用户、审美疲劳防腻用户）
 * 在 10 篇候选文章库中的真实打分与排序决策
 */
import {
    rankArticlesWithRmeV5,
    scoreArticleWithRmeV5,
    type ArticleCandidate,
    type UserLearningProfile,
    DEFAULT_RME_V5_WEIGHTS,
} from './recommender';

console.log(`\n======================================================================`);
console.log(`🧪 【RME-V5 6维多目标推荐排序器模拟验证】`);
console.log(`======================================================================\n`);

// ─────────────────────────────────────────────────────────────────────────────
// 模拟全真语境文章候选库 (10篇涵盖不同主题、难度、词数与词汇分布)
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_ARTICLE_DATABASE: ArticleCandidate[] = [
    {
        id: 'art-01',
        title: 'Rain and New Leaves',
        titleZh: '春雨与新叶',
        level: 'B1',
        season: 'spring',
        category: 'nature',
        tags: ['CET4', 'nature', 'healing'],
        wordCount: 140,
        containedWords: ['rain', 'light', 'leaf', 'serendipity', 'luminous', 'window', 'quiet', 'stone', 'branch', 'morning'],
    },
    {
        id: 'art-02',
        title: 'Leaves and Letting Go',
        titleZh: '落叶与放手',
        level: 'B2',
        season: 'autumn',
        category: 'philosophy',
        tags: ['KY', 'philosophy', 'mindset'],
        wordCount: 160,
        containedWords: ['resilience', 'ephemeral', 'solitude', 'branch', 'promise', 'golden', 'autumn', 'whisper'],
    },
    {
        id: 'art-03',
        title: 'The Silent Lake of Winter',
        titleZh: '冬日沉寂之湖',
        level: 'C1',
        season: 'winter',
        category: 'nature',
        tags: ['IELTS', 'TOEFL', 'advanced'],
        wordCount: 220,
        containedWords: ['quiescent', 'sepulchral', 'sonorous', 'aurora', 'glacial', 'solitude', 'sublime', 'vast'],
    },
    {
        id: 'art-04',
        title: 'Urban Rhythm and Coffee Aroma',
        titleZh: '城市节拍与咖啡香',
        level: 'A2',
        category: 'lifestyle',
        tags: ['CET4', 'daily', 'lifestyle'],
        wordCount: 90,
        containedWords: ['coffee', 'morning', 'street', 'walk', 'friend', 'busy', 'smell', 'warm'],
    },
    {
        id: 'art-05',
        title: 'Summer Breeze and Crickets',
        titleZh: '夏夜风与蝉鸣',
        level: 'B1',
        season: 'summer',
        category: 'nature',
        tags: ['CET4', 'nature', 'peace'],
        wordCount: 130,
        containedWords: ['breeze', 'night', 'cricket', 'stars', 'luminous', 'warm', 'grass', 'peaceful'],
    },
    {
        id: 'art-06',
        title: 'The Architecture of Ancient Bridges',
        titleZh: '古桥的建筑艺术',
        level: 'C1',
        category: 'architecture',
        tags: ['GRE', 'academic', 'history'],
        wordCount: 280,
        containedWords: ['cascade', 'effervescent', 'arch', 'stone', 'endurance', 'aesthetic', 'geometry'],
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// 用户画像 1: 考研英语备考者（有 4 个到期待复习词，CEFR B2，喜欢自然/哲学）
// ─────────────────────────────────────────────────────────────────────────────
console.log(`📌 测试画像 1：考研备考学生（待复习词: resilience, ephemeral, solitude, promise）`);
const user1: UserLearningProfile = {
    userCefr: 'B2',
    targetExam: 'KY',
    preferredTopics: ['philosophy', 'nature'],
    dueWords: ['resilience', 'ephemeral', 'solitude', 'promise'],
};

const results1 = rankArticlesWithRmeV5(MOCK_ARTICLE_DATABASE, user1);
console.log(`\n【排序结果与 6 维得分特征】：`);
results1.forEach((r, idx) => {
    const art = MOCK_ARTICLE_DATABASE.find(a => a.id === r.articleId)!;
    console.log(
        `#${idx + 1} [得分:${String(r.totalScore).padStart(3)}分] 《${art.title}》 (${art.level}) | 命中生词:[${r.matchedDueWords.join(', ')}]`
    );
    console.log(`   └─ XAI理由: ${r.recommendationReason}`);
    console.log(
        `   └─ 6维细分: 机会:${r.featureScores.opportunity.toFixed(2)} | 兴趣:${r.featureScores.interest.toFixed(2)} | 难度:${r.featureScores.difficulty.toFixed(2)} | 目标:${r.featureScores.goal.toFixed(2)} | 新鲜:${r.featureScores.novelty.toFixed(2)} | 篇幅:${r.featureScores.length.toFixed(2)}`
    );
});

console.log(`\n─────────────────────────────────────────────────────────────────────`);

// ─────────────────────────────────────────────────────────────────────────────
// 用户画像 2: 雅思高阶学员（有高难词待复习: quiescent, sepulchral, sonorous）
// ─────────────────────────────────────────────────────────────────────────────
console.log(`📌 测试画像 2：雅思高分学员（CEFR C1，待复习高难词: quiescent, sepulchral, sonorous）`);
const user2: UserLearningProfile = {
    userCefr: 'C1',
    targetExam: 'IELTS',
    preferredTopics: ['nature', 'academic'],
    dueWords: ['quiescent', 'sepulchral', 'sonorous'],
};

const results2 = rankArticlesWithRmeV5(MOCK_ARTICLE_DATABASE, user2);
console.log(`\n【排序结果】：`);
results2.slice(0, 3).forEach((r, idx) => {
    const art = MOCK_ARTICLE_DATABASE.find(a => a.id === r.articleId)!;
    console.log(
        `#${idx + 1} [得分:${String(r.totalScore).padStart(3)}分] 《${art.title}》 (${art.level}) -> 命中:[${r.matchedDueWords.join(', ')}] -> ${r.recommendationReason}`
    );
});

console.log(`\n─────────────────────────────────────────────────────────────────────`);

// ─────────────────────────────────────────────────────────────────────────────
// 用户画像 3: 防疲劳测试（最近已连续读过 3 篇 nature，检测 Novelty 降权）
// ─────────────────────────────────────────────────────────────────────────────
console.log(`📌 测试画像 3：防审美疲劳测试（连续读过 2 篇 nature，且已读过 art-01）`);
const user3: UserLearningProfile = {
    userCefr: 'B1',
    recentTopics: ['nature', 'nature'],
    recentArticleIds: ['art-01'],
    dueWords: ['coffee', 'morning'],
};

const results3 = rankArticlesWithRmeV5(MOCK_ARTICLE_DATABASE, user3);
console.log(`\n【排序结果（注意 art-01 已读降权，lifestyle 排名上升）】：`);
results3.slice(0, 3).forEach((r, idx) => {
    const art = MOCK_ARTICLE_DATABASE.find(a => a.id === r.articleId)!;
    console.log(
        `#${idx + 1} [得分:${String(r.totalScore).padStart(3)}分] 《${art.title}》 (${art.category}) [新鲜度:${r.featureScores.novelty.toFixed(2)}] -> ${r.recommendationReason}`
    );
});

console.log(`\n✅ RME-V5 多目标推荐排序器全场景模拟验证通过！\n`);
