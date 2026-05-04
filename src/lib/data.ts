import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const WORD_DATABASE_PATH = path.join(process.cwd(), 'data', 'word_text_database', 'word_database');
const WORD_LIBRARY_PATH = path.join(process.cwd(), 'data', 'word_library');
const CSV_PATH = path.join(process.cwd(), 'data', 'word_fission_data.csv');
const ECDICT_PATH = path.join(process.cwd(), 'data', 'ecdict_extracted.csv');

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

// Cache the CSV data in memory to avoid re-parsing on every request
let cachedCsvData: WordData[] | null = null;
let cachedEcdictData: Map<string, EcdictData> | null = null;

async function getCsvData(): Promise<WordData[]> {
    if (cachedCsvData) return cachedCsvData;

    const fileContent = fs.readFileSync(CSV_PATH, 'utf8');
    return new Promise((resolve, reject) => {
        Papa.parse(fileContent, {
            header: true,
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
            complete: (results) => {
                const map = new Map<string, EcdictData>();
                (results.data as any[]).forEach(row => {
                    const word = row['单词名称'];
                    if (word) {
                        const item: EcdictData = {
                            word: word,
                            phonetic: row['音标'] || '',
                            definition: '', // Not in this CSV
                            translation: row['单词释义（中文）'] || '',
                            collins: row['柯林斯星级'] || '',
                            oxford: '', // Not in this CSV
                            tag: row['字符串标签'] || '',
                            bnc: '', // Not in this CSV
                            frq: '', // Not in this CSV
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

export interface LibraryItem {
    name: string;
    type: 'file' | 'directory';
    path: string; // Relative path from WORD_LIBRARY_PATH
    count?: number;
}

export async function getLibraryList(relativePath: string = ''): Promise<LibraryItem[]> {
    try {
        // Prevent directory traversal attacks
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
                // Show directories and .csv files, ignore hidden files
                return !dirent.name.startsWith('.') && (dirent.isDirectory() || dirent.name.endsWith('.csv'));
            })
            .map(dirent => ({
                name: dirent.name,
                type: (dirent.isDirectory() ? 'directory' : 'file') as 'directory' | 'file',
                path: path.join(safePath, dirent.name)
            }))
            .sort((a, b) => {
                // Directories first, then files
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
    try {
        // Prevent directory traversal attacks
        const safePath = path.normalize(libraryPath).replace(/^(\.\.[\/\\])+/, '');
        const filePath = path.join(WORD_LIBRARY_PATH, safePath);

        if (!fs.existsSync(filePath)) {
            return [];
        }

        const fileContent = await fs.promises.readFile(filePath, 'utf8');
        return new Promise((resolve) => {
            Papa.parse(fileContent, {
                header: true,
                complete: (results) => {
                    // CSV format: 序号,单词
                    const words = (results.data as any[])
                        .map(row => row['单词'])
                        .filter(word => word && typeof word === 'string' && word.trim().length > 0);
                    resolve(words);
                },
                error: (error: Error) => {
                    console.error(`Error parsing CSV ${libraryPath}:`, error);
                    resolve([]);
                }
            });
        });
    } catch (error) {
        console.error('Error reading library words:', error);
        return [];
    }
}

export async function getLibraryGroups(libraryPath: string, groupSize: number = 100): Promise<{ index: number; start: number; end: number; label: string }[]> {
    const words = await getLibraryWords(libraryPath);
    const total = words.length;
    const groups = [];

    // Add "All" option
    groups.push({
        index: -1,
        start: 1,
        end: total,
        label: `All Words (${total})`
    });

    for (let i = 0; i < total; i += groupSize) {
        const end = Math.min(i + groupSize, total);
        groups.push({
            index: Math.floor(i / groupSize),
            start: i + 1,
            end: end,
            label: `Group ${Math.floor(i / groupSize) + 1} (${i + 1}-${end})`
        });
    }
    return groups;
}

export async function getWordList(query: string = ''): Promise<string[]> {
    try {
        if (!query) {
            // Default view is handled by UI (libraries list), so return empty if no query
            return [];
        }

        // Search view: Search in the full database
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
        // Handle potential case sensitivity or file naming issues if needed
        // For now assuming exact match + .md
        const filePath = path.join(WORD_DATABASE_PATH, `${word}.md`);
        const content = await fs.promises.readFile(filePath, 'utf8');
        return content;
    } catch (error) {
        console.error(`Error reading details for ${word}:`, error);
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

    // Helper to add node if not exists
    const addNode = (id: string, level: 0 | 1 | 2) => {
        const existing = nodes.get(id);
        if (!existing || existing.level > level) {
            nodes.set(id, {
                id,
                name: id,
                val: level === 0 ? 20 : level === 1 ? 10 : 5,
                level,
                color: level === 0 ? '#ff0000' : level === 1 ? '#00ff00' : '#cccccc', // Placeholder colors
                phonetic: ecdictMap.get(id.toLowerCase())?.phonetic,
                translation: ecdictMap.get(id.toLowerCase())?.translation?.replace(/\\n/g, ' ')
            });
        }
    };

    // Color palette for different meanings
    const meaningColors = [
        '#ef4444', // Type 1: Red (red-500)
        '#3b82f6', // Type 2: Blue (blue-500)
        '#10b981', // Type 3: Green (emerald-500)
        '#f59e0b', // Type 4: Amber (amber-500)
        '#8b5cf6', // Type 5: Violet (violet-500)
        '#ec4899', // Type 6: Pink (pink-500)
        '#06b6d4', // Type 7: Cyan (cyan-500)
        '#f97316', // Type 8: Orange (orange-500)
    ];

    const getMeaningColor = (meaning: string | undefined) => {
        if (!meaning) return '#9ca3af'; // gray-400
        // Extract number if possible, or hash string
        const num = parseInt(meaning);
        if (!isNaN(num)) {
            return meaningColors[(num - 1) % meaningColors.length];
        }
        return meaningColors[0];
    };

    // Level 0: The target word
    addNode(targetWord, 0);

    // Find Level 1 connections (synonyms of target word)
    const level1Rows = data.filter(row => row.word?.toLowerCase() === lowerTarget);

    const level1Synonyms = new Set<string>();

    level1Rows.forEach(row => {
        if (!row.synonym) return;

        // Capture definition for this meaning number
        if (row.meaning_number && row.definition_text) {
            definitions[row.meaning_number] = row.definition_text;
        }

        const syn = row.synonym;
        level1Synonyms.add(syn);

        // Use meaning color for the link and the node if it's level 1
        const color = getMeaningColor(row.meaning_number);

        // We update the node color if it's newly added
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

    // Find Level 2 connections (synonyms of Level 1 words)
    // Optimization: Filter data for all level 1 synonyms at once
    const level2Rows = data.filter(row => row.word && level1Synonyms.has(row.word));

    level2Rows.forEach(row => {
        if (!row.synonym) return;
        const syn = row.synonym;
        // Avoid adding target word again as level 2
        if (syn.toLowerCase() === lowerTarget) return;

        const color = getMeaningColor(row.meaning_number);

        // Level 2 nodes are lighter/smaller
        addNode(syn, 2);

        // Update level 2 node color to be lighter version or just gray, 
        // but links should be colored by meaning of the parent->child relationship

        links.push({
            source: row.word, // This is a level 1 word
            target: syn,
            meaning: row.meaning_number,
            color: color
        });
    });

    return {
        nodes: Array.from(nodes.values()),
        links,
        definitions
    };
}

// Chinese Data Interfaces
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
    // Extended fields from ECDICT
    phonetic?: string;
    collins?: string;
}

const CHINESE_DATA_PATH = path.join(process.cwd(), 'data', 'word_chinese');

export async function getWordChineseData(word: string): Promise<ChineseData | null> {
    try {
        const filePath = path.join(CHINESE_DATA_PATH, `${word}.json`);
        const content = await fs.promises.readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        // It's okay if the file doesn't exist
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
        // Get all available JSON files in the Chinese data directory
        if (!fs.existsSync(CHINESE_DATA_PATH)) {
            return [];
        }

        const files = await fs.promises.readdir(CHINESE_DATA_PATH);
        const jsonFiles = files.filter(file => file.endsWith('.json') && !file.startsWith('.'));

        // Shuffle and pick 'count' files
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

// User library support functions
import { prisma } from './prisma';

export interface EnrichedWord {
    id: string;
    word: string;
    sequence: number;
    phonetic?: string;
    translation?: string;
    chineseData?: ChineseData | null;
}

export async function getUserLibraryWords(
    libraryId: string,
    userId: string,
    groupIndex?: number,
    groupSize?: number
): Promise<string[]> {
    try {
        // Verify library ownership
        const library = await prisma.userLibrary.findUnique({
            where: { id: libraryId },
        });

        if (!library || library.userId !== userId) {
            return [];
        }

        let query: any = {
            where: { libraryId },
            orderBy: { sequence: 'asc' },
            select: { word: true },
        };

        if (groupIndex !== undefined && groupSize !== undefined && groupIndex >= 0) {
            query.skip = groupIndex * groupSize;
            query.take = groupSize;
        }

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
        // Verify library ownership
        const library = await prisma.userLibrary.findUnique({
            where: { id: libraryId },
        });

        if (!library || library.userId !== userId) {
            return [];
        }

        let query: any = {
            where: { libraryId },
            orderBy: { sequence: 'asc' },
        };

        if (groupIndex !== undefined && groupSize !== undefined && groupIndex >= 0) {
            query.skip = groupIndex * groupSize;
            query.take = groupSize;
        }

        const words = await prisma.userLibraryWord.findMany(query);
        const ecdictMap = await getEcdictData();

        // Enrich with dictionary data
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
        // Verify library ownership
        const library = await prisma.userLibrary.findUnique({
            where: { id: libraryId },
        });

        if (!library || library.userId !== userId) {
            return [];
        }

        const totalWords = library.wordCount;
        const totalGroups = Math.ceil(totalWords / groupSize);

        const groups: GroupInfo[] = [];
        for (let i = 0; i < totalGroups; i++) {
            const startIndex = i * groupSize;
            const endIndex = Math.min(startIndex + groupSize, totalWords);
            groups.push({
                index: i,
                name: `Group ${i + 1} (${startIndex + 1}-${endIndex})`,
                wordCount: endIndex - startIndex,
            });
        }

        return groups;
    } catch (error) {
        console.error('Error getting user library groups:', error);
        return [];
    }
}
