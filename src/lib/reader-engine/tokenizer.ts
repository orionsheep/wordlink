/**
 * WordLink Reading Engine —— 交互式分词器
 * 将句子切分为带标记的单词 Token，支持点击单词呼出 WordLink 裂变星图与词根积木。
 */

export interface WordToken {
    text: string;      // 原始文本 (如 "luminous," 或 " ")
    cleanWord: string; // 纯单词小写 (如 "luminous")
    isWord: boolean;   // 是否为可查词汇 (排除空格与标点)
}

export function tokenizeSentence(sentence: string): WordToken[] {
    if (!sentence) return [];
    // 按单词边界及标点切分
    const parts = sentence.split(/(\s+|[.,!?;:"'()\[\]{}]+)/).filter(Boolean);
    return parts.map((part) => {
        const clean = part.toLowerCase().replace(/[^a-z-]/g, '').trim();
        const isWord = /^[a-zA-Z-]+$/.test(clean) && clean.length > 0;
        return {
            text: part,
            cleanWord: clean,
            isWord,
        };
    });
}
