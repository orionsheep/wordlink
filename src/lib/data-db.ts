/**
 * Database-backed data access layer with caching
 * Replaces file-based data access from data.ts
 */

import { prisma } from './prisma';
import { cache, CACHE_KEYS } from './cache';
import type {
  GraphNode,
  GraphLink,
  GraphData,
  ChineseData,
  ChineseDefinition,
  ChineseComparison,
  EcdictData,
} from './data';

/**
 * Get word markdown content from database with caching
 */
export async function getWordDetails(word: string): Promise<string | null> {
  const cacheKey = CACHE_KEYS.wordMarkdown(word);
  const cached = await cache.get<string>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const data = await prisma.wordMarkdown.findUnique({
      where: { word },
      select: { content: true },
    });

    if (data) {
      await cache.set(cacheKey, data.content);
      return data.content;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching word details for ${word}:`, error);
    return null;
  }
}

/**
 * Get enriched word data (Chinese + Ecdict) from database with caching
 */
export async function getEnrichedWordData(word: string): Promise<ChineseData | null> {
  const cacheKey = CACHE_KEYS.wordEnriched(word);
  const cached = await cache.get<ChineseData>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const data = await prisma.word.findUnique({
      where: { word },
      include: {
        chineseData: true,
        ecdictData: true,
      },
    });

    if (!data) {
      return null;
    }

    // Transform database data to ChineseData format
    let enrichedData: ChineseData;

    if (data.chineseData) {
      enrichedData = {
        word: data.chineseData.word,
        pronunciation: data.chineseData.pronunciation,
        concise_definition: data.chineseData.conciseDefinition,
        forms: data.chineseData.forms as Record<string, string>,
        definitions: data.chineseData.definitions as unknown as ChineseDefinition[],
        comparison: data.chineseData.comparison as unknown as ChineseComparison[],
        phonetic: data.ecdictData?.phonetic,
        collins: data.ecdictData?.collins,
      };
    } else if (data.ecdictData) {
      // Fallback to ecdict data if no Chinese data
      enrichedData = {
        word: data.ecdictData.word,
        pronunciation: data.ecdictData.phonetic || '',
        concise_definition: data.ecdictData.translation?.replace(/\\n/g, ' ') || '',
        forms: {},
        definitions: [],
        comparison: [],
        phonetic: data.ecdictData.phonetic,
        collins: data.ecdictData.collins,
      };
    } else {
      return null;
    }

    await cache.set(cacheKey, enrichedData);
    return enrichedData;
  } catch (error) {
    console.error(`Error fetching enriched data for ${word}:`, error);
    return null;
  }
}

/**
 * Get word Chinese data only
 */
export async function getWordChineseData(word: string): Promise<ChineseData | null> {
  return getEnrichedWordData(word);
}

/**
 * Get fission graph data from database with caching
 */
export async function getFissionData(targetWord: string): Promise<GraphData> {
  const cacheKey = CACHE_KEYS.fissionGraph(targetWord);
  const cached = await cache.get<GraphData>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const lowerTarget = targetWord.toLowerCase();

    // Get level 1 data (direct relationships)
    const level1Data = await prisma.wordFission.findMany({
      where: { word: lowerTarget },
    });

    // Get level 1 synonyms
    const level1Synonyms = level1Data.map(d => d.synonym.toLowerCase());

    // Get level 2 data (relationships of synonyms)
    const level2Data = await prisma.wordFission.findMany({
      where: { word: { in: level1Synonyms } },
    });

    // Get ecdict data for phonetics and translations
    const allWords = new Set([lowerTarget, ...level1Synonyms]);
    level2Data.forEach(d => allWords.add(d.synonym.toLowerCase()));

    const ecdictData = await prisma.wordEcdict.findMany({
      where: { word: { in: Array.from(allWords) } },
    });

    const ecdictMap = new Map(ecdictData.map(e => [e.word.toLowerCase(), e]));

    // Build graph
    const graphData = buildGraphFromData(targetWord, level1Data, level2Data, ecdictMap);
    await cache.set(cacheKey, graphData);
    return graphData;
  } catch (error) {
    console.error(`Error fetching fission data for ${targetWord}:`, error);
    return { nodes: [], links: [], definitions: {} };
  }
}

/**
 * Build graph structure from database data
 */
function buildGraphFromData(
  targetWord: string,
  level1Data: any[],
  level2Data: any[],
  ecdictMap: Map<string, any>
): GraphData {
  const nodes: Map<string, GraphNode> = new Map();
  const links: GraphLink[] = [];
  const definitions: Record<string, string> = {};

  const lowerTarget = targetWord.toLowerCase();

  // Helper to add node if not exists
  const addNode = (id: string, level: 0 | 1 | 2) => {
    const existing = nodes.get(id);
    if (!existing || existing.level > level) {
      const ecdict = ecdictMap.get(id.toLowerCase());
      nodes.set(id, {
        id,
        name: id,
        val: level === 0 ? 20 : level === 1 ? 10 : 5,
        level,
        color: level === 0 ? '#ff0000' : level === 1 ? '#00ff00' : '#cccccc',
        phonetic: ecdict?.phonetic,
        translation: ecdict?.translation?.replace(/\\n/g, ' '),
      });
    }
  };

  // Color palette for different meanings
  const meaningColors = [
    '#ef4444', '#3b82f6', '#10b981', '#f59e0b',
    '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
  ];

  // Add target node (level 0)
  addNode(lowerTarget, 0);

  // Process level 1 relationships
  level1Data.forEach((row, index) => {
    const synonym = row.synonym.toLowerCase();
    addNode(synonym, 1);

    const color = meaningColors[index % meaningColors.length];
    links.push({
      source: lowerTarget,
      target: synonym,
      color,
      meaning: row.definitionText,
    });

    definitions[`${lowerTarget}-${synonym}`] = row.definitionText;
  });

  // Process level 2 relationships
  level2Data.forEach(row => {
    const word = row.word.toLowerCase();
    const synonym = row.synonym.toLowerCase();

    if (word !== lowerTarget && synonym !== lowerTarget) {
      addNode(synonym, 2);

      const existingLink = links.find(l => l.source === word && l.target === synonym);
      if (!existingLink) {
        links.push({
          source: word,
          target: synonym,
          color: '#cccccc',
        });
      }
    }
  });

  return {
    nodes: Array.from(nodes.values()),
    links,
    definitions,
  };
}

/**
 * Get all words from database
 */
export async function getAllWords(): Promise<string[]> {
  const cacheKey = CACHE_KEYS.allWords();
  const cached = await cache.get<string[]>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const words = await prisma.word.findMany({
      select: { word: true },
      orderBy: { word: 'asc' },
    });

    const wordList = words.map(w => w.word);
    await cache.set(cacheKey, wordList, 1000 * 60 * 60); // Cache for 1 hour
    return wordList;
  } catch (error) {
    console.error('Error fetching all words:', error);
    return [];
  }
}

/**
 * Search words by query string
 */
export async function getWordList(query: string = ''): Promise<string[]> {
  try {
    if (!query) {
      return [];
    }

    const lowerQuery = query.toLowerCase();
    const words = await prisma.word.findMany({
      where: {
        word: {
          contains: lowerQuery,
          mode: 'insensitive',
        },
      },
      select: { word: true },
      orderBy: { word: 'asc' },
      take: 100, // Limit results for performance
    });

    return words.map(w => w.word);
  } catch (error) {
    console.error('Error searching words:', error);
    return [];
  }
}

/**
 * Get quiz data for multiple words
 */
export async function getQuizDataForWords(
  words: string[]
): Promise<{ word: string; chineseData: ChineseData | null }[]> {
  try {
    const results = await Promise.all(
      words.map(async (word) => {
        const chineseData = await getEnrichedWordData(word);
        return { word, chineseData };
      })
    );
    return results;
  } catch (error) {
    console.error('Error getting quiz data for words:', error);
    return [];
  }
}

/**
 * Get random words for quiz
 */
export async function getQuizWords(
  count: number
): Promise<{ word: string; chineseData: ChineseData | null }[]> {
  try {
    // Get random words that have Chinese data
    const words = await prisma.wordChinese.findMany({
      take: count,
      select: { word: true },
      orderBy: { createdAt: 'desc' }, // Could use random ordering in production
    });

    return getQuizDataForWords(words.map(w => w.word));
  } catch (error) {
    console.error('Error getting quiz words:', error);
    return [];
  }
}

// Re-export types and other functions from data.ts that don't need database access
export type {
  GraphNode,
  GraphLink,
  GraphData,
  ChineseData,
  ChineseDefinition,
  ChineseComparison,
  EcdictData,
} from './data';

export { getLibraryList, getLibraryGroups, getLibraryWords } from './data';
