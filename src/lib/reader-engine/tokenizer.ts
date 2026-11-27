/**
 * WordLink Reading Engine —— 交互式分词器
 * 将句子切分为带标记的单词 Token，支持点击单词呼出 WordLink 裂变星图与词根积木。
 */

export interface WordToken {
    text: string;      // 原始文本 (如 "luminous," 或 " ")
    cleanWord: string; // 纯单词小写 (如 "luminous")
    isWord: boolean;   // 是否为可查词汇 (排除空格与标点)
}

// 匹配完整英文词元：允许词内单撇号（' / ’）或单连字符（-），
// 自动将破折号（— / –）、双连字符（--）及首尾标点/连字符保留在非词分隔符中
const WORD_SPLIT_RE = /([A-Za-z]+(?:['’-][A-Za-z]+)*)/;
const WORD_EXACT_RE = /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/;

export function tokenizeSentence(sentence: string): WordToken[] {
    if (!sentence) return [];
    const parts = sentence.split(WORD_SPLIT_RE).filter(Boolean);
    return parts.map((part) => {
        if (!WORD_EXACT_RE.test(part)) {
            return {
                text: part,
                cleanWord: '',
                isWord: false,
            };
        }
        const clean = part
            .toLowerCase()
            .replace(/’/g, "'")
            .replace(/^[^a-z]+|[^a-z]+$/g, '');
        const isWord = clean.length > 0 && /^[a-z]+(?:['-][a-z]+)*$/.test(clean);
        return {
            text: part,
            cleanWord: isWord ? clean : '',
            isWord,
        };
    });
}
