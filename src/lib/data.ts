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

export interface GraphNode {
    id: string;
    name: string;
    val: number; // size
    color?: string;
    level: 0 | 1 | 2;
    phonetic?: string;
    translation?: string;
}

export interface GraphLink {
    source: string;
    target: string;
    color?: string;
    meaning?: string;
}

export interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
    definitions?: Record<string, string>;
}

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
let cachedCsvData: WordData[] | null = null;
let cachedEcdictData: Map<string, EcdictData> | null = null;
const cachedLibraryFiles = new Map<string, string[]>();

async function getCsvData(): Promise<WordData[]> {
    if (cachedCsvData) return cachedCsvData;
    if (!fs.existsSync(CSV_PATH)) return [];

    const fileContent = fs.readFileSync(CSV_PATH, 'utf8');
    return new Promise((resolve, reject) => {
        Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                cachedCsvData = results.data as WordData[];
                resolve(cachedCsvData);
            },
            error: (error: Error) => reject(error),
        });
    });
}

async function getEcdictData(): Promise<Map<string, EcdictData>> {
    if (cachedEcdictData) return cachedEcdictData;

    if (!fs.existsSync(ECDICT_PATH)) {
        return new Map();
    }

    const fileContent = fs.readFileSync(ECDICT_PATH, 'utf8');
    return new Promise((resolve, reject) => {
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
                cachedEcdictData = map;
                resolve(map);
            },
            error: (error: Error) => reject(error),
        });
    });
}

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
        const filePath = path.join(WORD_LIBRARY_PATH, safePath);

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

export async function getFissionData(targetWord: string): Promise<GraphData> {
    if (!targetWord) {
        return { nodes: [], links: {}, definitions: {} } as any;
    }

    const normalizedTarget = targetWord.toLowerCase().trim();
    const cacheKey = CACHE_KEYS.fissionGraph(normalizedTarget);
    const cached = await cache.get<GraphData>(cacheKey);
    if (cached !== null) return cached;

    const meaningColors = [
        '#ef4444',
        '#3b82f6',
        '#10b981',
        '#f59e0b',
        '#8b5cf6',
        '#ec4899',
        '#06b6d4',
        '#f97316',
    ];

    const getMeaningColor = (meaning: string | undefined) => {
        if (!meaning) return '#9ca3af';
        const num = parseInt(meaning);
        if (!isNaN(num)) {
            return meaningColors[(num - 1) % meaningColors.length];
        }
        return meaningColors[0];
    };

    try {
        const rows = await prisma.$queryRawUnsafe<Array<{
            word: string;
            synonym: string;
            meaningNumber: string;
            definitionText: string;
            level: number;
        }>>(`
            WITH l1 AS (
              SELECT 
                word, 
                synonym, 
                "meaningNumber", 
                "definitionText",
                1 AS level
              FROM "LPT_english"."word_fission"
              WHERE word = $1
            ),
            l2 AS (
              SELECT 
                f.word, 
                f.synonym, 
                f."meaningNumber", 
                f."definitionText",
                2 AS level
              FROM "LPT_english"."word_fission" f
              INNER JOIN l1 ON f.word = l1.synonym
              WHERE f.synonym <> $1
            )
            SELECT * FROM l1
            UNION ALL
            SELECT * FROM l2;
        `, normalizedTarget);

        if (rows.length > 0) {
            const allWords = new Set<string>([normalizedTarget]);
            const definitions: Record<string, string> = {};

            rows.forEach(r => {
                if (r.word) allWords.add(r.word);
                if (r.synonym) allWords.add(r.synonym);
                if (r.level === 1 && r.meaningNumber && r.definitionText) {
                    definitions[r.meaningNumber] = r.definitionText;
                }
            });

            // Batch fetch ECDICT metadata
            const ecdictRecords = await prisma.word_ecdict.findMany({
                where: { word: { in: Array.from(allWords) } },
                select: { word: true, phonetic: true, translation: true },
            });
            const ecdictMap = new Map<string, { phonetic: string; translation: string }>();
            ecdictRecords.forEach((r) => {
                ecdictMap.set(r.word.toLowerCase(), {
                    phonetic: r.phonetic,
                    translation: r.translation?.replace(/\\n/g, ' ') || '',
                });
            });

            const nodes: Map<string, GraphNode> = new Map();
            const links: GraphLink[] = [];

            const addNode = (id: string, level: 0 | 1 | 2, color?: string) => {
                const existing = nodes.get(id);
                if (!existing || existing.level > level) {
                    const ecdict = ecdictMap.get(id.toLowerCase());
                    nodes.set(id, {
                        id,
                        name: id,
                        val: level === 0 ? 20 : level === 1 ? 10 : 5,
                        level,
                        color: color || (level === 0 ? '#ff0000' : level === 1 ? '#00ff00' : '#cccccc'),
                        phonetic: ecdict?.phonetic,
                        translation: ecdict?.translation,
                    });
                }
            };

            addNode(normalizedTarget, 0);

            rows.forEach((row) => {
                if (!row.synonym) return;
                const syn = row.synonym;
                const color = getMeaningColor(row.meaningNumber);

                if (row.level === 1) {
                    addNode(syn, 1, color);
                    links.push({
                        source: normalizedTarget,
                        target: syn,
                        meaning: row.meaningNumber,
                        color: color,
                    });
                } else {
                    addNode(syn, 2, '#cccccc');
                    links.push({
                        source: row.word,
                        target: syn,
                        meaning: row.meaningNumber,
                        color: color,
                    });
                }
            });

            const result: GraphData = {
                nodes: Array.from(nodes.values()),
                links,
                definitions,
            };

            await cache.set(cacheKey, result);
            return result;
        }
    } catch {
        // Fallback to legacy file reading below
    }

    // Legacy file-based fallback
    const data = await getCsvData();
    const ecdictMap = await getEcdictData();
    const lowerTarget = normalizedTarget;

    const nodes: Map<string, GraphNode> = new Map();
    const links: GraphLink[] = [];
    const definitions: Record<string, string> = {};

    const addNodeFallback = (id: string, level: 0 | 1 | 2) => {
        const existing = nodes.get(id);
        if (!existing || existing.level > level) {
            nodes.set(id, {
                id,
                name: id,
                val: level === 0 ? 20 : level === 1 ? 10 : 5,
                level,
                color: level === 0 ? '#ff0000' : level === 1 ? '#00ff00' : '#cccccc',
                phonetic: ecdictMap.get(id.toLowerCase())?.phonetic,
                translation: ecdictMap.get(id.toLowerCase())?.translation?.replace(/\\n/g, ' ')
            });
        }
    };

    addNodeFallback(targetWord, 0);

    const level1Rows = data.filter(row => row.word?.toLowerCase() === lowerTarget);
    const level1Synonyms = new Set<string>();

    level1Rows.forEach(row => {
        if (!row.synonym) return;

        if (row.meaning_number && row.definition_text) {
            definitions[row.meaning_number] = row.definition_text;
        }

        const syn = row.synonym;
        level1Synonyms.add(syn);
        const color = getMeaningColor(row.meaning_number);

        const existing = nodes.get(syn);
        if (!existing) {
            const ecdictEntry = ecdictMap.get(syn.toLowerCase());
            nodes.set(syn, {
                id: syn,
                name: syn,
                val: 10,
                level: 1,
                color: color,
                phonetic: ecdictEntry?.phonetic,
                translation: ecdictEntry?.translation?.replace(/\\n/g, ' ')
            });
        }

        links.push({
            source: targetWord,
            target: syn,
            meaning: row.meaning_number,
            color: color
        });
    });

    const level2Rows = data.filter(row => row.word && level1Synonyms.has(row.word));

    level2Rows.forEach(row => {
        if (!row.synonym) return;
        const syn = row.synonym;
        if (syn.toLowerCase() === lowerTarget) return;

        const color = getMeaningColor(row.meaning_number);
        const existing = nodes.get(syn);
        if (!existing) {
            const ecdictEntry = ecdictMap.get(syn.toLowerCase());
            nodes.set(syn, {
                id: syn,
                name: syn,
                val: 5,
                level: 2,
                color: '#cccccc',
                phonetic: ecdictEntry?.phonetic,
                translation: ecdictEntry?.translation?.replace(/\\n/g, ' ')
            });
        }

        links.push({
            source: row.word,
            target: syn,
            meaning: row.meaning_number,
            color: color
        });
    });

    const result = {
        nodes: Array.from(nodes.values()),
        links: links,
        definitions: definitions
    };
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
    try {
        const randomWords = await prisma.$queryRaw<Array<{ word: string }>>`
            SELECT word FROM "LPT_english"."word_chinese"
            ORDER BY RANDOM()
            LIMIT ${count}
        `;

        if (randomWords.length > 0) {
            const wordList = randomWords.map(r => r.word);
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
    groupSize?: number
): Promise<EnrichedWord[]> {
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
            ...(groupIndex !== undefined && groupSize !== undefined && groupIndex >= 0
                ? { skip: groupIndex * groupSize, take: groupSize }
                : {}),
        };

        const words = await prisma.userLibraryWord.findMany(query);
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
