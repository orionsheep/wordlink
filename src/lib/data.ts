import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { prisma } from './prisma';
import { cache, CACHE_KEYS } from './cache';

const WORD_DATABASE_PATH = path.join(process.cwd(), 'data', 'word_text_database', 'word_database');
const WORD_LIBRARY_PATH = path.join(process.cwd(), 'data', 'word_library');
const CSV_PATH = path.join(process.cwd(), 'data', 'word_fission_data.csv');
const ECDICT_PATH = path.join(process.cwd(), 'data', 'ecdict_extracted.csv');
const CHINESE_DATA_PATH = path.join(process.cwd(), 'data', 'word_chinese');

export interface EcdictData {
    word: string;
    phonetic: string;
    definition: string;
    translation: string;
    collins: string;
    oxford: string;
    tag: string;
    bnc: string;
    frq: string;
    exchange: string;
}

export interface WordData {
    word_id: string;
    word: string;
    part_of_speech: string;
    meaning_number: string;
    definition_text: string;
    synonym: string;
}

// 词链图共享类型/常量拆到 graph-shared.ts，供客户端组件直接引用
export type { GraphNode, RelationType, GraphLink, GraphData } from './graph-shared';
export { RELATION_COLORS } from './graph-shared';
import type { GraphNode, GraphLink, GraphData, RelationType } from './graph-shared';
import { RELATION_COLORS } from './graph-shared';

export interface ChineseDefinition {
    pos: string;
    explanation_en: string;
    explanation_cn: string;
    example_en: string;
    example_cn: string;
}

export interface ChineseComparison {
    word_to_compare: string;
    analysis: string;
}

export interface ChineseData {
    word: string;
    pronunciation: string;
    concise_definition: string;
    forms: Record<string, string>;
    definitions: ChineseDefinition[];
    comparison: ChineseComparison[];
    phonetic?: string;
    collins?: string;
}

export interface LibraryItem {
    name: string;
    type: 'file' | 'directory';
    path: string;
    count?: number;
}

export interface EnrichedWord {
    id: string;
    word: string;
    sequence: number;
    phonetic?: string;
    translation?: string;
    chineseData?: ChineseData | null;
}

export interface GroupInfo {
    index: number;
    name: string;
    wordCount: number;
}

// Fallback in-memory cache for legacy files
// once()：并发去重——大文件只读/解析一次（并发调用共享同一 Promise），
// 失败时解锁使下次调用可重试（与原 cache-miss 重试语义一致）
function once<T>(load: () => Promise<T>): () => Promise<T> {
    let pending: Promise<T> | null = null;
    return () => {
        if (!pending) {
            const p = load();
            pending = p;
            p.catch(() => { if (pending === p) pending = null; });
        }
        return pending;
    };
}

function pushIndex(map: Map<string, number[]>, key: string, index: number): void {
    const arr = map.get(key);
    if (arr) arr.push(index);
    else map.set(key, [index]);
}

const cachedLibraryFiles = new Map<string, string[]>();

interface WordDataIndex {
    rows: WordData[];
    // lower(word) -> 行下标（升序即文件顺序），fallback 按词直查而非全表扫描
    byWord: Map<string, number[]>;
}

const getCsvData = once(async (): Promise<WordDataIndex> => {
    const empty: WordDataIndex = { rows: [], byWord: new Map() };
    if (!fs.existsSync(CSV_PATH)) return empty;

    const fileContent = await fs.promises.readFile(CSV_PATH, 'utf8');
    const rows = await new Promise<WordData[]>((resolve, reject) => {
        Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data as WordData[]),
            error: (error: Error) => reject(error),
        });
    });
    const byWord = new Map<string, number[]>();
    rows.forEach((r, i) => { if (r.word) pushIndex(byWord, r.word.toLowerCase(), i); });
    return { rows, byWord };
});

// ===== 类型化词链边（word_relation_edges.csv，由 scripts/build-word-edges.ts 生成）=====
const RELATION_EDGES_PATH = path.join(process.cwd(), 'data', 'word_relation_edges.csv');

export interface RelationEdgeRow {
    word: string;
    target: string;
    relation_type: RelationType;
    part_of_speech?: string;
    meaning_number?: string;
    definition_text?: string;
    source?: string;
}

interface RelationEdgeIndex {
    rows: RelationEdgeRow[];
    // lower(word)/lower(target) -> 行下标（升序即文件顺序），fallback 按词直查而非全表扫描
    byWord: Map<string, number[]>;
    byTarget: Map<string, number[]>;
}

const getRelationEdges = once(async (): Promise<RelationEdgeIndex> => {
    const empty: RelationEdgeIndex = { rows: [], byWord: new Map(), byTarget: new Map() };
    if (!fs.existsSync(RELATION_EDGES_PATH)) return empty;

    const fileContent = await fs.promises.readFile(RELATION_EDGES_PATH, 'utf8');
    const rows = await new Promise<RelationEdgeRow[]>((resolve, reject) => {
        Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(
                (results.data as RelationEdgeRow[]).filter(
                    r => r.word && r.target && r.relation_type
                )
            ),
            error: (error: Error) => reject(error),
        });
    });
    const byWord = new Map<string, number[]>();
    const byTarget = new Map<string, number[]>();
    rows.forEach((r, i) => {
        pushIndex(byWord, r.word.toLowerCase(), i);
        pushIndex(byTarget, r.target.toLowerCase(), i);
    });
    return { rows, byWord, byTarget };
});

// 已建词条的词干集合（fallback 占位判定）：word_chinese 的 json 词干，模块级只读一次
const getKnownLemmas = once(async (): Promise<Set<string>> => {
    const set = new Set<string>();
    try {
        if (fs.existsSync(CHINESE_DATA_PATH)) {
            for (const f of await fs.promises.readdir(CHINESE_DATA_PATH)) {
                if (f.endsWith('.json')) set.add(f.replace(/\.json$/, ''));
            }
        }
    } catch { /* ignore */ }
    return set;
});

const getEcdictData = once(async (): Promise<Map<string, EcdictData>> => {
    if (!fs.existsSync(ECDICT_PATH)) {
        return new Map();
    }

    const fileContent = await fs.promises.readFile(ECDICT_PATH, 'utf8');
    return new Promise<Map<string, EcdictData>>((resolve, reject) => {
        Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const map = new Map<string, EcdictData>();
                (results.data as Record<string, string>[]).forEach(row => {
                    const word = row['单词名称'];
                    if (word) {
                        const item: EcdictData = {
                            word: word,
                            phonetic: row['音标'] || '',
                            definition: '',
                            translation: row['单词释义（中文）'] || '',
                            collins: row['柯林斯星级'] || '',
                            oxford: '',
                            tag: row['字符串标签'] || '',
                            bnc: '',
                            frq: '',
                            exchange: row['时态复数等变换'] || ''
                        };
                        map.set(word.toLowerCase(), item);
                    }
                });
                resolve(map);
            },
            error: (error: Error) => reject(error),
        });
    });
});

/**
 * Parse a library file without touching the filesystem.
 */
export function parseLibraryFileContent(content: string): string[] {
    if (typeof content !== 'string' || !content.trim()) return [];

    const aliases = new Set([
        '序号', '编号', '序列号', '单词', '单词名称', '词汇',
        'index', 'number', 'no', 'no.', 'id', 'serial', 'sequence', 'word', 'words', 'vocabulary',
        'english', 'englishword', 'term', 'terms', 'spelling', 'vocab', '英文', '英文单词', '词',
    ]);
    const normalizeHeader = (value: string) => value
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
        .replace(/[\s_\-]+/g, '')
        .replace(/[.:#]+$/g, '');
    const isEnglishField = (value: string) => {
        const normalized = value.trim().replace(/^["']|["']$/g, '');
        return normalized.length > 0 && /^[A-Za-z][A-Za-z\s\-']*$/.test(normalized);
    };
    const cleanWord = (value: string) => value
        .replace(/^\uFEFF/, '')
        .trim()
        .replace(/^["']|["']$/g, '')
        .trim()
        .replace(/^\d+[\s.,、)\]]+/, '')
        .trim();

    const parseRow = (line: string): string[] | null => {
        const quoteCount = (line.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0) return null;
        const delimiter = line.includes('\t') ? '\t' : ',';
        if (!line.includes(delimiter)) return [line.trim()];
        try {
            const parsed = Papa.parse<string[]>(line, {
                delimiter,
                skipEmptyLines: true,
                dynamicTyping: false,
            });
            if (parsed.errors.length > 0) return null;
            if (Array.isArray(parsed.data?.[0])) {
                return parsed.data[0].map((field) => String(field ?? '').trim());
            }
        } catch {
            // Fall through
        }
        return line.split(delimiter).map((field) => field.trim());
    };

    const normalizedContent = content.replace(/^\uFEFF/, '');
    const hasStructuredDelimiter = normalizedContent.includes(',') || normalizedContent.includes('\t');
    const parsedRows = normalizedContent.split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map(parseRow);
    if (parsedRows.some((row) => row === null)) {
        return [];
    }
    const rows = parsedRows as string[][];
    if (rows.length === 0) return [];

    const firstRow = rows[0];
    const headerIndexes = firstRow.map(normalizeHeader);
    const wordColumn = headerIndexes.findIndex((header) =>
        aliases.has(header) && !['序号', '编号', '序列号', 'index', 'number', 'no', 'no.', 'id', 'serial', 'sequence'].includes(header)
    );
    const looksLikeHeader = hasStructuredDelimiter && headerIndexes.some((header) => aliases.has(header));
    const startIndex = looksLikeHeader ? 1 : 0;
    const words: string[] = [];

    for (let rowIndex = startIndex; rowIndex < rows.length; rowIndex += 1) {
        const fields = rows[rowIndex].map((field) => cleanWord(field));
        if (fields.length === 0) continue;

        let candidate = '';
        if (wordColumn >= 0) {
            candidate = fields[wordColumn] || '';
        } else if (/^\d+$/.test(fields[0])) {
            candidate = fields.slice(1).find(isEnglishField) || '';
        } else if (fields.length > 1) {
            candidate = fields.find(isEnglishField) || '';
        } else {
            candidate = fields[0];
        }

        candidate = cleanWord(candidate);
        if (!candidate || !isEnglishField(candidate)) continue;
        words.push(candidate);
    }

    return words;
}

export async function getLibraryList(relativePath: string = ''): Promise<LibraryItem[]> {
    try {
        const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
        const targetPath = path.join(WORD_LIBRARY_PATH, safePath);

        if (!fs.existsSync(targetPath)) {
            return [];
        }

        const stats = await fs.promises.stat(targetPath);
        if (!stats.isDirectory()) {
            return [];
        }

        const files = await fs.promises.readdir(targetPath, { withFileTypes: true });

        const items: LibraryItem[] = files
            .filter(dirent => {
                return !dirent.name.startsWith('.') && (dirent.isDirectory() || dirent.name.endsWith('.csv') || dirent.name.endsWith('.txt'));
            })
            .map(dirent => ({
                name: dirent.name,
                type: (dirent.isDirectory() ? 'directory' : 'file') as 'directory' | 'file',
                path: path.join(safePath, dirent.name).replace(/\\/g, '/')
            }))
            .sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });

        return items;
    } catch (error) {
        console.error('Error reading library list:', error);
        return [];
    }
}

export async function getLibraryWords(libraryPath: string): Promise<string[]> {
    const normalizedKey = libraryPath.replace(/\\/g, '/');

    // Handle user libraries
    if (normalizedKey.startsWith('user:')) {
        const libraryId = normalizedKey.replace('user:', '');
        const words = await prisma.userLibraryWord.findMany({
            where: { libraryId },
            orderBy: { sequence: 'asc' },
            select: { word: true },
        });
        return words.map((w) => w.word);
    }

    const cached = cachedLibraryFiles.get(normalizedKey);
    if (cached) return cached;

    try {
        const safePath = path.normalize(libraryPath).replace(/^(\.\.[\/\\])+/, '');
        const resolvedRoot = path.resolve(WORD_LIBRARY_PATH);
        const filePath = path.resolve(resolvedRoot, safePath);

        // 路径穿越防护：解析后的真实路径必须仍在词库根目录内
        if (!filePath.startsWith(resolvedRoot + path.sep)) {
            console.error('Blocked path traversal attempt:', libraryPath);
            return [];
        }

        if (!fs.existsSync(filePath)) {
            return [];
        }

        const fileContent = await fs.promises.readFile(filePath, 'utf8');
        const words = parseLibraryFileContent(fileContent);
        cachedLibraryFiles.set(normalizedKey, words);
        return words;
    } catch (error) {
        console.error('Error reading library words:', error);
        return [];
    }
}

export async function getLibraryGroups(libraryPath: string, groupSize: number = 100): Promise<{ index: number; start: number; end: number; label: string }[]> {
    const words = await getLibraryWords(libraryPath);
    const total = words.length;
    const groups = [];
    const safeGroupSize = Number.isFinite(groupSize) && groupSize > 0 ? Math.floor(groupSize) : 100;

    groups.push({
        index: -1,
        start: 1,
        end: total,
        label: `All Words (${total})`
    });

    for (let i = 0; i < total; i += safeGroupSize) {
        const end = Math.min(i + safeGroupSize, total);
        groups.push({
            index: Math.floor(i / safeGroupSize),
            start: i + 1,
            end: end,
            label: `Group ${Math.floor(i / safeGroupSize) + 1} (${i + 1}-${end})`
        });
    }
    return groups;
}

function getNextPrefixBound(prefix: string): string {
    if (!prefix) return '';
    const lastChar = prefix.charCodeAt(prefix.length - 1);
    return prefix.slice(0, -1) + String.fromCharCode(lastChar + 1);
}

/**
 * High-performance B-tree index prefix search (< 1ms)
 */
export async function getWordList(query: string = ''): Promise<string[]> {
    if (!query) return [];
    const normalizedQuery = query.toLowerCase().trim();
    const cacheKey = `search:${normalizedQuery}`;
    const cached = await cache.get<string[]>(cacheKey);
    if (cached) return cached;

    try {
        const nextBound = getNextPrefixBound(normalizedQuery);
        let rows: Array<{ word: string }> = [];

        if (nextBound) {
            rows = await prisma.$queryRawUnsafe<Array<{ word: string }>>(`
                SELECT word 
                FROM "LPT_english"."words" 
                WHERE lower(word) >= $1 AND lower(word) < $2
                ORDER BY lower(word) ASC 
                LIMIT 100;
            `, normalizedQuery, nextBound);
        }

        if (rows.length === 0) {
            rows = await prisma.$queryRawUnsafe<Array<{ word: string }>>(`
                SELECT word 
                FROM "LPT_english"."words" 
                WHERE lower(word) LIKE $1
                ORDER BY lower(word) ASC 
                LIMIT 100;
            `, normalizedQuery + '%');
        }

        const result = rows.map(r => r.word);
        await cache.set(cacheKey, result, 1000 * 60 * 30);
        return result;
    } catch (error) {
        // Fallback to filesystem
        try {
            const files = await fs.promises.readdir(WORD_DATABASE_PATH);
            const words = files
                .filter((file) => file.endsWith('.md') && !file.startsWith('.'))
                .map((file) => file.replace('.md', ''));
            const lowerQuery = query.toLowerCase();
            return words.filter((word) => word.toLowerCase().includes(lowerQuery)).sort();
        } catch {
            return [];
        }
    }
}

export async function getWordDetails(word: string): Promise<string | null> {
    if (!word) return null;
    const normalizedWord = word.toLowerCase().trim();
    const cacheKey = CACHE_KEYS.wordMarkdown(normalizedWord);
    const cached = await cache.get<string>(cacheKey);
    if (cached !== null) return cached;

    try {
        const rows = await prisma.$queryRawUnsafe<Array<{ content: string }>>(`
            SELECT content 
            FROM "LPT_english"."word_markdown"
            WHERE lower(word) = $1
            LIMIT 1;
        `, normalizedWord);

        if (rows.length > 0 && rows[0].content) {
            await cache.set(cacheKey, rows[0].content);
            return rows[0].content;
        }
    } catch (error) {
        // Fallback below
    }

    try {
        const filePath = path.join(WORD_DATABASE_PATH, `${word}.md`);
        if (!fs.existsSync(filePath)) return null;
        const content = await fs.promises.readFile(filePath, 'utf8');
        await cache.set(cacheKey, content);
        return content;
    } catch {
        return null;
    }
}

export async function getWordChineseData(word: string): Promise<ChineseData | null> {
    if (!word) return null;
    const normalizedWord = word.toLowerCase().trim();
    const cacheKey = `word:chinese:${normalizedWord}`;
    const cached = await cache.get<ChineseData>(cacheKey);
    if (cached !== null) return cached;

    try {
        const record = await prisma.word_chinese.findUnique({
            where: { word: normalizedWord },
        });

        if (record) {
            const data: ChineseData = {
                word: record.word,
                pronunciation: record.pronunciation || '',
                concise_definition: record.conciseDefinition || '',
                forms: (record.forms as Record<string, string>) || {},
                definitions: (record.definitions as unknown as ChineseDefinition[]) || [],
                comparison: (record.comparison as unknown as ChineseComparison[]) || [],
            };
            await cache.set(cacheKey, data);
            return data;
        }
    } catch {
        // Fallback below
    }

    try {
        const filePath = path.join(CHINESE_DATA_PATH, `${word}.json`);
        if (!fs.existsSync(filePath)) return null;
        const content = await fs.promises.readFile(filePath, 'utf8');
        const data = JSON.parse(content);
        await cache.set(cacheKey, data);
        return data;
    } catch {
        return null;
    }
}

/**
 * One-roundtrip consolidated query for word detail (Chinese + ECDICT + Markdown)
 */
export async function getEnrichedWordData(word: string): Promise<ChineseData | null> {
    if (!word) return null;
    const normalizedWord = word.toLowerCase().trim();
    const cacheKey = CACHE_KEYS.wordEnriched(normalizedWord);
    const cached = await cache.get<ChineseData>(cacheKey);
    if (cached !== null) return cached;

    try {
        const rows = await prisma.$queryRawUnsafe<Array<{
            word: string;
            pronunciation: string | null;
            chinese_concise: string | null;
            forms: any;
            definitions: any;
            comparison: any;
            phonetic: string | null;
            ecdict_translation: string | null;
            collins: string | null;
        }>>(`
            SELECT 
              w.word,
              c.pronunciation,
              c."conciseDefinition" AS chinese_concise,
              c.forms,
              c.definitions,
              c.comparison,
              e.phonetic,
              e.translation AS ecdict_translation,
              e.collins
            FROM "LPT_english"."words" w
            LEFT JOIN "LPT_english"."word_chinese" c ON c."wordId" = w.id
            LEFT JOIN "LPT_english"."word_ecdict" e ON e."wordId" = w.id
            WHERE lower(w.word) = $1
            LIMIT 1;
        `, normalizedWord);

        if (rows.length > 0) {
            const row = rows[0];
            let enriched: ChineseData | null = null;

            if (row.definitions || row.chinese_concise || row.pronunciation) {
                enriched = {
                    word: row.word,
                    pronunciation: row.pronunciation || '',
                    concise_definition: row.ecdict_translation
                        ? row.ecdict_translation.replace(/\\n/g, ' ')
                        : row.chinese_concise || '',
                    forms: (row.forms as Record<string, string>) || {},
                    definitions: (row.definitions as unknown as ChineseDefinition[]) || [],
                    comparison: (row.comparison as unknown as ChineseComparison[]) || [],
                    phonetic: row.phonetic || undefined,
                    collins: row.collins || undefined,
                };
            } else if (row.ecdict_translation) {
                enriched = {
                    word: row.word,
                    pronunciation: row.phonetic || '',
                    concise_definition: row.ecdict_translation.replace(/\\n/g, ' '),
                    forms: {},
                    definitions: [],
                    comparison: [],
                    phonetic: row.phonetic || undefined,
                    collins: row.collins || undefined,
                };
            }

            if (enriched) {
                await cache.set(cacheKey, enriched);
                return enriched;
            }
        }
    } catch {
        // Fallback to legacy file system logic
    }

    const ecdictMap = await getEcdictData();
    let chineseData = await getWordChineseData(word);
    const ecdictItem = ecdictMap.get(normalizedWord);

    if (ecdictItem) {
        if (!chineseData) {
            chineseData = {
                word: ecdictItem.word,
                pronunciation: ecdictItem.phonetic || '',
                concise_definition: ecdictItem.translation?.replace(/\\n/g, ' ') || '',
                forms: {},
                definitions: [],
                comparison: [],
                phonetic: ecdictItem.phonetic,
                collins: ecdictItem.collins,
            };
        } else {
            chineseData.phonetic = ecdictItem.phonetic;
            chineseData.collins = ecdictItem.collins;
            if (ecdictItem.translation) {
                chineseData.concise_definition = ecdictItem.translation.replace(/\\n/g, ' ');
            }
        }
    }

    if (chineseData) {
        await cache.set(cacheKey, chineseData);
    }
    return chineseData;
}

// ===== 裂变图谱 v2：类型化边 + 占位节点 =====
const L1_LINK_CAP = 120;
const L2_LINK_CAP = 240;
const TYPE_ORDER: RelationType[] = [
    'synonym', 'antonym', 'derivative', 'near_synonym', 'inflection', 'spelling_similar',
];

interface FissionEdgeRow {
    // from/to 已按 BFS 方向归一化：L1 恒为 中心词→邻居；L2 为 邻居→下一跳
    from: string;
    to: string;
    type: RelationType;
    meaning?: string;
    definitionText?: string;
    level: 1 | 2;
}

interface NodeMeta { phonetic?: string; translation?: string }

function assembleFissionGraph(
    normalizedTarget: string,
    rows: FissionEdgeRow[],
    known: Set<string>,
    meta: Map<string, NodeMeta>,
): GraphData {
    const seen = new Set<string>();
    const l1: FissionEdgeRow[] = [];
    const l2: FissionEdgeRow[] = [];
    for (const r of rows) {
        if (!r.to) continue;
        const key = `${r.from}|${r.to}|${r.type}|${r.meaning ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        (r.level === 1 ? l1 : l2).push(r);
    }
    // 类型轮询配额：每类先分一份保底，剩余名额按类型顺序补齐——避免同义海把其他类型挤出上限
    const quota = (list: FissionEdgeRow[], cap: number) => {
        const byType = new Map<RelationType, FissionEdgeRow[]>();
        for (const r of list) {
            const arr = byType.get(r.type) || [];
            arr.push(r);
            byType.set(r.type, arr);
        }
        const ordered = [...byType.entries()].sort((a, b) =>
            TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0]));
        const base = Math.floor(cap / Math.max(1, ordered.length));
        const picked: FissionEdgeRow[] = [];
        let spare = 0;
        for (const [, arr] of ordered) {
            picked.push(...arr.slice(0, base));
            spare += Math.max(0, arr.length - base);
        }
        for (const [, arr] of ordered) {
            if (spare <= 0) break;
            const extra = arr.slice(base, base + spare);
            spare -= extra.length;
            picked.push(...extra);
        }
        return picked;
    };
    const picked = quota(l1, L1_LINK_CAP).concat(quota(l2, L2_LINK_CAP));

    const nodes = new Map<string, GraphNode>();
    const links: GraphLink[] = [];
    const definitions: Record<string, string> = {};

    const addNode = (id: string, level: 0 | 1 | 2, color?: string) => {
        const existing = nodes.get(id);
        if (!existing || existing.level > level) {
            const placeholder = level !== 0 && !known.has(id);
            const m = meta.get(id.toLowerCase());
            nodes.set(id, {
                id,
                name: id,
                val: level === 0 ? 20 : level === 1 ? 10 : 5,
                level,
                color: placeholder ? '#9ca3af'
                    : (color || (level === 0 ? '#ff0000' : level === 1 ? '#00ff00' : '#cccccc')),
                phonetic: m?.phonetic,
                translation: m?.translation,
                placeholder: placeholder || undefined,
            });
        }
    };

    addNode(normalizedTarget, 0);

    for (const row of picked) {
        const color = RELATION_COLORS[row.type] ?? '#3b82f6';
        if (row.level === 1 && row.type === 'synonym' && row.meaning && row.definitionText) {
            definitions[row.meaning] = row.definitionText;
        }
        if (row.level === 1) {
            addNode(row.to, 1, color);
        } else {
            addNode(row.to, 2);
        }
        links.push({
            source: row.from,
            target: row.to,
            meaning: row.meaning,
            color,
            type: row.type,
            status: known.has(row.to) ? 'confirmed' : 'pending',
        });
    }

    return { nodes: Array.from(nodes.values()), links, definitions };
}

export async function getFissionData(targetWord: string): Promise<GraphData> {
    if (!targetWord) {
        return { nodes: [], links: {}, definitions: {} } as any;
    }

    const normalizedTarget = targetWord.toLowerCase().trim();
    const cacheKey = CACHE_KEYS.fissionGraph(normalizedTarget);
    const cached = await cache.get<GraphData>(cacheKey);
    if (cached !== null) return cached;

    try {
        const [typedRows, legacyRows] = await Promise.all([
            prisma.$queryRawUnsafe<Array<{
                from_word: string; to_word: string; relation_type: string;
                meaningNumber: string; definitionText: string; level: number;
            }>>(`
                WITH l1_ranked AS (
                  -- L1：中心词的出边 + 入边，统一翻转成 中心→邻居；
                  -- trn 为各关系类型内序号，l1_pairs 按 trn 排序实现类型轮询截断，
                  -- 近似 JS 侧 quota() 的类型配额语义
                  SELECT word AS from_word, target AS to_word, "relationType" AS relation_type,
                         "meaningNumber", "definitionText",
                         row_number() OVER (PARTITION BY "relationType" ORDER BY target) AS trn
                  FROM "LPT_english"."word_relation" WHERE word = $1
                  UNION ALL
                  SELECT target AS from_word, word AS to_word, "relationType" AS relation_type,
                         "meaningNumber", "definitionText",
                         row_number() OVER (PARTITION BY "relationType" ORDER BY word) AS trn
                  FROM "LPT_english"."word_relation" WHERE target = $1 AND word <> $1
                ),
                l1_pairs AS (
                  SELECT from_word, to_word, relation_type, "meaningNumber", "definitionText"
                  FROM l1_ranked
                  ORDER BY trn, relation_type
                  LIMIT ${L1_LINK_CAP}
                ),
                l1_neighbors AS (
                  SELECT DISTINCT to_word FROM l1_pairs
                ),
                l2_ranked AS (
                  -- L2：L1 邻居的出边（邻居→下一跳），不回指中心词；
                  -- 每邻居限量 ceil(240/邻居数) 且总量 ≤240，避免高频邻居全量展开
                  SELECT r.word AS from_word, r.target AS to_word, r."relationType" AS relation_type,
                         r."meaningNumber", r."definitionText",
                         row_number() OVER (
                           PARTITION BY r.word
                           ORDER BY CASE r."relationType"
                             WHEN 'synonym' THEN 0 WHEN 'antonym' THEN 1 WHEN 'derivative' THEN 2
                             WHEN 'near_synonym' THEN 3 WHEN 'inflection' THEN 4 WHEN 'spelling_similar' THEN 5
                             ELSE 6 END, r.target
                         ) AS rn
                  FROM "LPT_english"."word_relation" r
                  JOIN l1_neighbors n ON r.word = n.to_word
                  WHERE r.target <> $1
                ),
                l2 AS (
                  SELECT from_word, to_word, relation_type, "meaningNumber", "definitionText"
                  FROM l2_ranked
                  WHERE rn <= GREATEST(1, CEIL(${L2_LINK_CAP}::numeric / GREATEST((SELECT count(*) FROM l1_neighbors), 1)))
                  ORDER BY rn
                  LIMIT ${L2_LINK_CAP}
                )
                SELECT from_word, to_word, relation_type, "meaningNumber", "definitionText", 1 AS level
                FROM l1_pairs
                UNION ALL
                SELECT from_word, to_word, relation_type, "meaningNumber", "definitionText", 2 AS level
                FROM l2;
            `, normalizedTarget),
            prisma.$queryRawUnsafe<Array<{
                word: string; synonym: string; meaningNumber: string;
                definitionText: string; level: number;
            }>>(`
                WITH l1 AS (
                  SELECT word, synonym, "meaningNumber", "definitionText", 1 AS level
                  FROM "LPT_english"."word_fission"
                  WHERE word = $1
                  LIMIT ${L1_LINK_CAP}
                ),
                l1_neighbors AS (
                  -- DISTINCT：原 INNER JOIN 对重复 synonym 产生的重复边会被 JS 去重抹平，此处等价
                  SELECT DISTINCT synonym AS to_word FROM l1
                ),
                l2_ranked AS (
                  SELECT f.word, f.synonym, f."meaningNumber", f."definitionText",
                         row_number() OVER (PARTITION BY f.word ORDER BY f.synonym) AS rn
                  FROM "LPT_english"."word_fission" f
                  JOIN l1_neighbors n ON f.word = n.to_word
                  WHERE f.synonym <> $1
                ),
                l2 AS (
                  SELECT word, synonym, "meaningNumber", "definitionText", 2 AS level
                  FROM l2_ranked
                  WHERE rn <= GREATEST(1, CEIL(${L2_LINK_CAP}::numeric / GREATEST((SELECT count(*) FROM l1_neighbors), 1)))
                  ORDER BY rn
                  LIMIT ${L2_LINK_CAP}
                )
                SELECT * FROM l1
                UNION ALL
                SELECT * FROM l2;
            `, normalizedTarget),
        ]);

        if (typedRows.length > 0 || legacyRows.length > 0) {
            const typedPairs = new Set(typedRows.map(r => `${r.from_word}|${r.to_word}`));
            const rows: FissionEdgeRow[] = [
                ...typedRows.map(r => ({
                    from: r.from_word.toLowerCase(), to: r.to_word.toLowerCase(),
                    type: r.relation_type as RelationType,
                    meaning: r.meaningNumber, definitionText: r.definitionText,
                    level: r.level as 1 | 2,
                })),
                ...legacyRows
                    .filter(r => !typedPairs.has(`${r.word}|${r.synonym}`))
                    .map(r => ({
                        from: r.word.toLowerCase(), to: r.synonym.toLowerCase(),
                        type: 'synonym' as RelationType,
                        meaning: r.meaningNumber, definitionText: r.definitionText,
                        level: r.level as 1 | 2,
                    })),
            ];

            // 占位判定：目标词是否在 words 表；元数据来自 word_ecdict
            const lemmas = new Set<string>([normalizedTarget]);
            rows.forEach(r => { lemmas.add(r.from); lemmas.add(r.to); });
            const lemmaArr = Array.from(lemmas);
            const [wordRecords, ecdictRecords] = await Promise.all([
                prisma.words.findMany({ where: { word: { in: lemmaArr } }, select: { word: true } }),
                prisma.word_ecdict.findMany({
                    where: { word: { in: lemmaArr } },
                    select: { word: true, phonetic: true, translation: true },
                }),
            ]);
            const known = new Set(wordRecords.map(w => w.word));
            const meta = new Map<string, NodeMeta>();
            ecdictRecords.forEach(r => meta.set(r.word.toLowerCase(), {
                phonetic: r.phonetic,
                translation: r.translation?.replace(/\\n/g, ' ') || '',
            }));

            const result = assembleFissionGraph(normalizedTarget, rows, known, meta);
            await cache.set(cacheKey, result);
            return result;
        }
    } catch {
        // Fallback to file-based reading below
    }

    // ===== 文件 fallback：word_relation_edges.csv + 旧 fission CSV =====
    // 走预建索引（lower(word)/lower(target) -> 行下标），替代原来的多次全表 forEach；
    // 候选行按下标升序遍历，行序与原全表顺序一致，保证输出不变
    const [edgeIndex, legacyIndex, ecdictMap, known] = await Promise.all([
        getRelationEdges(), getCsvData(), getEcdictData(), getKnownLemmas(),
    ]);

    const { rows: edgeRows, byWord: edgeByWord, byTarget: edgeByTarget } = edgeIndex;

    const rows: FissionEdgeRow[] = [];
    const l1Targets = new Set<string>();
    // 与中心词相连的边 = byWord ∪ byTarget 命中行（逻辑上覆盖原循环的两个判断分支）
    const incident = new Set<number>([
        ...(edgeByWord.get(normalizedTarget) ?? []),
        ...(edgeByTarget.get(normalizedTarget) ?? []),
    ]);
    for (const i of incident) {
        const r = edgeRows[i];
        if (r.word === normalizedTarget) l1Targets.add(r.target.toLowerCase());
        else if (r.target.toLowerCase() === normalizedTarget) l1Targets.add(r.word.toLowerCase());
    }
    // 第二遍候选 = 与中心词相连的边 ∪ 各 L1 邻居的出边
    const edgeCandidates = new Set<number>(incident);
    for (const w of l1Targets) {
        for (const i of edgeByWord.get(w) ?? []) edgeCandidates.add(i);
    }
    for (const i of [...edgeCandidates].sort((a, b) => a - b)) {
        const r = edgeRows[i];
        const w = r.word.toLowerCase(), t = r.target.toLowerCase();
        if (w === normalizedTarget) {
            rows.push({ from: w, to: t, type: r.relation_type, meaning: r.meaning_number, definitionText: r.definition_text, level: 1 });
        } else if (t === normalizedTarget) {
            rows.push({ from: t, to: w, type: r.relation_type, meaning: r.meaning_number, definitionText: r.definition_text, level: 1 });
        } else if (l1Targets.has(w) && t !== normalizedTarget) {
            rows.push({ from: w, to: t, type: r.relation_type, meaning: r.meaning_number, definitionText: r.definition_text, level: 2 });
        }
    }

    const typedPairs = new Set(rows.map(r => `${r.from}|${r.to}`));
    const { rows: legacyRows, byWord: legacyByWord } = legacyIndex;
    const legacyL1 = new Set<string>();
    for (const i of legacyByWord.get(normalizedTarget) ?? []) {
        const row = legacyRows[i];
        if (row.synonym) {
            legacyL1.add(row.synonym.toLowerCase());
        }
    }
    const legacyCandidates = new Set<number>(legacyByWord.get(normalizedTarget) ?? []);
    for (const w of legacyL1) {
        for (const i of legacyByWord.get(w) ?? []) legacyCandidates.add(i);
    }
    for (const i of [...legacyCandidates].sort((a, b) => a - b)) {
        const row = legacyRows[i];
        const w = row.word?.toLowerCase();
        const s = row.synonym?.toLowerCase();
        if (!w || !s || typedPairs.has(`${w}|${s}`)) continue;
        if (w === normalizedTarget) {
            rows.push({ from: w, to: s, type: 'synonym', meaning: row.meaning_number, definitionText: row.definition_text, level: 1 });
        } else if (legacyL1.has(w) && s !== normalizedTarget) {
            rows.push({ from: w, to: s, type: 'synonym', meaning: row.meaning_number, definitionText: row.definition_text, level: 2 });
        }
    }

    const meta = new Map<string, NodeMeta>();
    ecdictMap.forEach((v, k) => meta.set(k, {
        phonetic: v.phonetic,
        translation: v.translation?.replace(/\\n/g, ' '),
    }));

    // 占位判定与 DB 路径对齐：word_chinese 词干 ∪ ECDICT 词目（≈ words 表覆盖）
    const knownAll = new Set<string>([...known, ...ecdictMap.keys()]);

    const result = assembleFissionGraph(normalizedTarget, rows, knownAll, meta);
    await cache.set(cacheKey, result);
    return result;
}

export async function getQuizDataForWords(words: string[]): Promise<{ word: string; chineseData: ChineseData | null }[]> {
    if (!words || words.length === 0) return [];

    try {
        const lowerWords = words.map(w => w.toLowerCase());
        const dbWords = await prisma.words.findMany({
            where: { word: { in: lowerWords } },
            include: {
                word_chinese: true,
                word_ecdict: true,
            },
        });

        const wordMap = new Map<string, ChineseData>();
        for (const dbWord of dbWords) {
            if (dbWord.word_chinese) {
                wordMap.set(dbWord.word, {
                    word: dbWord.word_chinese.word,
                    pronunciation: dbWord.word_chinese.pronunciation || '',
                    concise_definition: dbWord.word_ecdict?.translation
                        ? dbWord.word_ecdict.translation.replace(/\\n/g, ' ')
                        : dbWord.word_chinese.conciseDefinition || '',
                    forms: (dbWord.word_chinese.forms as Record<string, string>) || {},
                    definitions: (dbWord.word_chinese.definitions as unknown as ChineseDefinition[]) || [],
                    comparison: (dbWord.word_chinese.comparison as unknown as ChineseComparison[]) || [],
                    phonetic: dbWord.word_ecdict?.phonetic || undefined,
                    collins: dbWord.word_ecdict?.collins || undefined,
                });
            } else if (dbWord.word_ecdict) {
                wordMap.set(dbWord.word, {
                    word: dbWord.word_ecdict.word,
                    pronunciation: dbWord.word_ecdict.phonetic || '',
                    concise_definition: dbWord.word_ecdict.translation?.replace(/\\n/g, ' ') || '',
                    forms: {},
                    definitions: [],
                    comparison: [],
                    phonetic: dbWord.word_ecdict.phonetic || undefined,
                    collins: dbWord.word_ecdict.collins || undefined,
                });
            }
        }

        return words.map(word => ({
            word,
            chineseData: wordMap.get(word.toLowerCase()) || null,
        }));
    } catch {
        // Fallback
        const results = await Promise.all(words.map(async (word) => {
            const chineseData = await getEnrichedWordData(word);
            return { word, chineseData };
        }));
        return results;
    }
}

export async function getQuizWords(count: number): Promise<{ word: string; chineseData: ChineseData | null }[]> {
    // count 来自客户端 query：夹在 [1, 200] 防止拖库
    const safeCount = Math.min(Math.max(Number.isFinite(count) ? Math.floor(count) : 10, 1), 200);
    try {
        // 避免 ORDER BY RANDOM() 全表排序：用 pg_class.reltuples 估算行数后随机 OFFSET 取连续段；
        // 段落在表尾不足 safeCount 时从表头补齐，数量语义与原 LIMIT 一致
        const randomWords = await prisma.$queryRaw<Array<{ word: string }>>`
            SELECT word FROM "LPT_english"."word_chinese"
            OFFSET (
                SELECT floor(random() * GREATEST(1, reltuples))::bigint
                FROM pg_class
                WHERE oid = '"LPT_english"."word_chinese"'::regclass
            )
            LIMIT ${safeCount}
        `;

        // reltuples 高估（如大量删除后未 ANALYZE）时 offset 可能越过表尾取到 0 行，
        // 此时同样从表头补齐，避免误入文件 fallback
        if (randomWords.length < safeCount) {
            const topUp = await prisma.$queryRaw<Array<{ word: string }>>`
                SELECT word FROM "LPT_english"."word_chinese"
                LIMIT ${safeCount - randomWords.length}
            `;
            randomWords.push(...topUp);
        }
        if (randomWords.length > 0) {
            const wordList = [...new Set(randomWords.map(r => r.word))];
            return getQuizDataForWords(wordList);
        }
    } catch {
        // Fallback to filesystem
    }

    try {
        if (!fs.existsSync(CHINESE_DATA_PATH)) {
            return [];
        }

        const files = await fs.promises.readdir(CHINESE_DATA_PATH);
        const jsonFiles = files.filter(file => file.endsWith('.json') && !file.startsWith('.'));
        const shuffled = jsonFiles.sort(() => 0.5 - Math.random()).slice(0, count);

        const results = await Promise.all(shuffled.map(async (file) => {
            const word = file.replace('.json', '');
            const chineseData = await getWordChineseData(word);
            return { word, chineseData };
        }));

        return results;
    } catch (error) {
        console.error('Error getting quiz words:', error);
        return [];
    }
}

export async function getUserLibraryWords(
    libraryId: string,
    userId: string,
    groupIndex?: number,
    groupSize?: number
): Promise<string[]> {
    try {
        const library = await prisma.userLibrary.findUnique({
            where: { id: libraryId },
        });

        if (!library || library.userId !== userId) {
            return [];
        }

        const query = {
            where: { libraryId },
            orderBy: { sequence: 'asc' as const },
            select: { word: true },
            ...(groupIndex !== undefined && groupSize !== undefined && groupIndex >= 0
                ? { skip: groupIndex * groupSize, take: groupSize }
                : {}),
        };

        const words = await prisma.userLibraryWord.findMany(query);
        return words.map((w) => w.word);
    } catch (error) {
        console.error('Error getting user library words:', error);
        return [];
    }
}

export async function getUserLibraryWordsEnriched(
    libraryId: string,
    userId: string,
    groupIndex?: number,
    groupSize?: number,
    prefetched?: {
        // 调用方已完成归属校验并按 sequence 取回词表行时直传，跳过重复的
        // userLibrary.findUnique 校验与 userLibraryWord.findMany 查询；
        // 传入后 groupIndex/groupSize 不再生效（调用方负责已分页的结果）
        words: { id: string; word: string; sequence: number }[];
    }
): Promise<EnrichedWord[]> {
    try {
        let words: { id: string; word: string; sequence: number }[];
        if (prefetched?.words) {
            words = prefetched.words;
        } else {
            const library = await prisma.userLibrary.findUnique({
                where: { id: libraryId },
            });

            if (!library || library.userId !== userId) {
                return [];
            }

            const query = {
                where: { libraryId },
                orderBy: { sequence: 'asc' as const },
                ...(groupIndex !== undefined && groupSize !== undefined && groupIndex >= 0
                    ? { skip: groupIndex * groupSize, take: groupSize }
                    : {}),
            };

            words = await prisma.userLibraryWord.findMany(query);
        }
        const wordNames = words.map(w => w.word.toLowerCase());

        const dbWords = await prisma.words.findMany({
            where: { word: { in: wordNames } },
            include: {
                word_chinese: true,
                word_ecdict: true,
            },
        });

        const wordInfoMap = new Map<string, { phonetic?: string; translation?: string; chineseData: ChineseData | null }>();
        for (const dw of dbWords) {
            let cData: ChineseData | null = null;
            if (dw.word_chinese) {
                cData = {
                    word: dw.word_chinese.word,
                    pronunciation: dw.word_chinese.pronunciation || '',
                    concise_definition: dw.word_ecdict?.translation
                        ? dw.word_ecdict.translation.replace(/\\n/g, ' ')
                        : dw.word_chinese.conciseDefinition || '',
                    forms: (dw.word_chinese.forms as Record<string, string>) || {},
                    definitions: (dw.word_chinese.definitions as unknown as ChineseDefinition[]) || [],
                    comparison: (dw.word_chinese.comparison as unknown as ChineseComparison[]) || [],
                    phonetic: dw.word_ecdict?.phonetic || undefined,
                    collins: dw.word_ecdict?.collins || undefined,
                };
            } else if (dw.word_ecdict) {
                cData = {
                    word: dw.word_ecdict.word,
                    pronunciation: dw.word_ecdict.phonetic || '',
                    concise_definition: dw.word_ecdict.translation?.replace(/\\n/g, ' ') || '',
                    forms: {},
                    definitions: [],
                    comparison: [],
                    phonetic: dw.word_ecdict.phonetic || undefined,
                    collins: dw.word_ecdict.collins || undefined,
                };
            }

            wordInfoMap.set(dw.word, {
                phonetic: dw.word_ecdict?.phonetic || undefined,
                translation: dw.word_ecdict?.translation?.replace(/\\n/g, ' ') || undefined,
                chineseData: cData,
            });
        }

        return words.map(w => {
            const info = wordInfoMap.get(w.word.toLowerCase());
            return {
                id: w.id,
                word: w.word,
                sequence: w.sequence,
                phonetic: info?.phonetic,
                translation: info?.translation,
                chineseData: info?.chineseData || null,
            };
        });
    } catch (error) {
        console.error('Error getting enriched user library words:', error);
        return [];
    }
}

export async function getUserLibraryGroups(
    libraryId: string,
    userId: string,
    groupSize: number = 100
): Promise<GroupInfo[]> {
    try {
        const library = await prisma.userLibrary.findUnique({
            where: { id: libraryId },
        });

        if (!library || library.userId !== userId) {
            return [];
        }

        const safeGroupSize = Number.isFinite(groupSize) && groupSize > 0
            ? Math.floor(groupSize)
            : 100;
        const totalWords = library.wordCount;
        const totalGroups = Math.ceil(totalWords / safeGroupSize);

        return Array.from({ length: totalGroups }, (_, index) => {
            const startIndex = index * safeGroupSize;
            const endIndex = Math.min(startIndex + safeGroupSize, totalWords);
            return {
                index,
                name: `Group ${index + 1} (${startIndex + 1}-${endIndex})`,
                wordCount: endIndex - startIndex,
            };
        });
    } catch (error) {
        console.error('Error getting user library groups:', error);
        return [];
    }
}
