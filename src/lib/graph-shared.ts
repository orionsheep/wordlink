// 词链图的共享类型与常量 —— 客户端组件也可安全引用（不得引入 fs/prisma 等服务端依赖）

export interface GraphNode {
    id: string;
    name: string;
    val: number; // size
    color?: string;
    level: 0 | 1 | 2;
    phonetic?: string;
    translation?: string;
    placeholder?: boolean; // 目标词未建词条：灰点占位
}

export type RelationType =
    | 'synonym' | 'near_synonym' | 'antonym'
    | 'derivative' | 'inflection' | 'spelling_similar';

export interface GraphLink {
    source: string;
    target: string;
    color?: string;
    meaning?: string;
    type?: RelationType;
    status?: 'confirmed' | 'pending'; // pending = 指向占位词的候选边，前端虚线
}

export const RELATION_COLORS: Record<RelationType, string> = {
    synonym: '#16A34A',
    near_synonym: '#0EA5E9',
    antonym: '#EF4444',
    derivative: '#8B5CF6',
    inflection: '#0D9488',
    spelling_similar: '#F59E0B',
};

export interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
    definitions?: Record<string, string>;
}
