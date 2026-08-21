import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { prisma } from './prisma';

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

// In-memory cache
let cachedCsvData: WordData[] | null = null;
let cachedEcdictData: Map<string, EcdictData> | null = null;
const cachedLibraryFiles = new Map<string, string[]>();

async function getCsvData(): Promise<WordData[]> {
    if (cachedCsvData) return cachedCsvData;

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
        console.warn('ECDICT CSV not found at:', ECDICT_PATH);
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
 * Parse a library file without touching the filesystem. The parser deliberately
 * keeps input order and duplicates: callers may use duplicate entries to mirror
 * an exam syllabus exactly. It accepts CSV/TSV, headerless numbered files and
 * plain one-word-per-line TXT files.
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
            // Fall through to a conservative split for malformed CSV quotes.
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
        console.warn('[parseLibraryFileContent] malformed CSV/TSV row; returning an empty library');
        return [];
    }
    const rows = parsedRows as string[][];
    if (rows.length === 0) return [];

    const firstRow = rows[0];
    const headerIndexes = firstRow.map(normalizeHeader);
    const wordColumn = headerIndexes.findIndex((header) =>
        aliases.has(header) && !['序号', '编号', '序列号', 'index', 'number', 'no', 'no.', 'id', 'serial', 'sequence'].includes(header)
    );
    // A delimiter-free file is the plain one-word-per-line TXT format. In that
    // format a perfectly valid word such as "word" must not be discarded as a
    // header merely because it is also a known column alias.
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
            // In a numbered, headerless CSV use the first valid English field
            // after the sequence number rather than blindly taking column 2.
            candidate = fields.slice(1).find(isEnglishField) || '';
        } else if (fields.length > 1) {
            candidate = fields.find(isEnglishField) || '';
        } else {
            candidate = fields[0];
        }

        candidate = cleanWord(candidate);
        // The header row has already been removed when a structured header is
        // detected. Do not reject a legitimate vocabulary item merely because
        // it happens to be named "word", "english", or another header alias
        // in a vocabulary row.
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

export async function getWordList(query: string = ''): Promise<string[]> {
    try {
        if (!query) {
            return [];
        }

        const files = await fs.promises.readdir(WORD_DATABASE_PATH);
        const words = files
            .filter((file) => file.endsWith('.md') && !file.startsWith('.'))
            .map((file) => file.replace('.md', ''));

        const lowerQuery = query.toLowerCase();
        return words.filter((word) => word.toLowerCase().includes(lowerQuery)).sort();
    } catch (error) {
        console.error('Error reading word list:', error);
        return [];
    }
}

export async function getWordDetails(word: string): Promise<string | null> {
    try {
        const filePath = path.join(WORD_DATABASE_PATH, `${word}.md`);
        if (!fs.existsSync(filePath)) return null;
        const content = await fs.promises.readFile(filePath, 'utf8');
        return content;
    } catch {
        return null;
    }
}

export async function getFissionData(targetWord: string): Promise<GraphData> {
    const data = await getCsvData();
    const ecdictMap = await getEcdictData();
    const lowerTarget = targetWord.toLowerCase();

    const nodes: Map<string, GraphNode> = new Map();
    const links: GraphLink[] = [];
    const definitions: Record<string, string> = {};

    const addNode = (id: string, level: 0 | 1 | 2) => {
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

    addNode(targetWord, 0);

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

    return {
        nodes: Array.from(nodes.values()),
        links: links,
        definitions: definitions
    };
}

export async function getWordChineseData(word: string): Promise<ChineseData | null> {
    try {
        const filePath = path.join(CHINESE_DATA_PATH, `${word}.json`);
        if (!fs.existsSync(filePath)) return null;
        const content = await fs.promises.readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

export async function getEnrichedWordData(word: string): Promise<ChineseData | null> {
    const ecdictMap = await getEcdictData();
    let chineseData = await getWordChineseData(word);
    const ecdictItem = ecdictMap.get(word.toLowerCase());

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
                collins: ecdictItem.collins
            };
        } else {
            chineseData.phonetic = ecdictItem.phonetic;
            chineseData.collins = ecdictItem.collins;
            if (ecdictItem.translation) {
                chineseData.concise_definition = ecdictItem.translation.replace(/\\n/g, ' ');
            }
        }
    }
    return chineseData;
}

export async function getQuizDataForWords(words: string[]): Promise<{ word: string; chineseData: ChineseData | null }[]> {
    try {
        const results = await Promise.all(words.map(async (word) => {
            const chineseData = await getEnrichedWordData(word);
            return { word, chineseData };
        }));
        return results;
    } catch (error) {
        console.error('Error getting quiz data for words:', error);
        return [];
    }
}

export async function getQuizWords(count: number): Promise<{ word: string; chineseData: ChineseData | null }[]> {
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
        const ecdictMap = await getEcdictData();

        const enriched = await Promise.all(
            words.map(async (w) => {
                const ecdictItem = ecdictMap.get(w.word.toLowerCase());
                const chineseData = await getEnrichedWordData(w.word);

                return {
                    id: w.id,
                    word: w.word,
                    sequence: w.sequence,
                    phonetic: ecdictItem?.phonetic,
                    translation: ecdictItem?.translation?.replace(/\\n/g, ' '),
                    chineseData,
                };
            })
        );

        return enriched;
    } catch (error) {
        console.error('Error getting enriched user library words:', error);
        return [];
    }
}

// Keep the existing user-library grouping contract intact while the file
// parser evolves independently. Consumers use this for the left-column
// outline and virtualized word-list navigation.
export interface GroupInfo {
    index: number;
    name: string;
    wordCount: number;
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
