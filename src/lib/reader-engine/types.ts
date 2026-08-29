/**
 * WordLink Reading Engine —— 统一类型定义
 */

export * from './fsrs';
export * from './recommender';

export interface ArticleSentence {
    index: number;
    paragraphIndex: number;
    text_en: string;
    text_zh?: string;
    audio_urls?: Record<string, string>; // EchoStream 句级音频
    explanation?: {
        low?: string;
        mid?: string;
        high?: string;
    };
}

export interface ArticleParagraphData {
    paragraphIndex: number;
    text_en: string;
    text_zh?: string;
    explanation?: string;
    sentence_explanations?: Record<string, unknown>;
    audio_url?: string;
    audio_sentences?: Array<{
        index: number;
        text: string;
        audio_urls?: Record<string, string>;
    }>;
}

export interface ReaderArticle {
    id: string;
    title: string;
    titleZh?: string | null;
    level: 'A2' | 'B1' | 'B2' | 'C1' | string;
    category?: string | null;
    season?: string | null;
    source: 'curated' | 'ai' | 'echostream';
    paragraphs: ArticleParagraphData[];
    wordCount: number;
    createdAt?: string | Date;
    // RME-V5 推荐打分字段
    recommendationScore?: number;
    matchedDueWords?: string[];
    recommendationReason?: string;
}
