import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

const prisma = new PrismaClient();

// Configuration
const BATCH_SIZE = 1000;
const DATA_DIR = path.join(process.cwd(), 'data');
const MARKDOWN_DIR = path.join(DATA_DIR, 'word_text_database', 'word_database');
const CHINESE_DIR = path.join(DATA_DIR, 'word_chinese');
const ECDICT_FILE = path.join(DATA_DIR, 'ecdict_extracted.csv');
const FISSION_FILE = path.join(DATA_DIR, 'word_fission_data.csv');

interface WordChineseData {
  word: string;
  pronunciation: string;
  concise_definition: string;
  forms: Record<string, string>;
  definitions: Array<{
    pos: string;
    explanation_en: string;
    explanation_cn: string;
    example_en: string;
    example_cn: string;
  }>;
  comparison: Array<{
    word_to_compare: string;
    analysis: string;
  }>;
}

interface EcdictRow {
  word: string;
  phonetic: string;
  translation: string;
  collins: string;
  tag: string;
  exchange: string;
}

interface FissionRow {
  word: string;
  part_of_speech: string;
  meaning_number: string;
  definition_text: string;
  synonym: string;
}

// Progress tracking
let totalProcessed = 0;

function logProgress(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Helper function to process items in batches
async function processBatch<T>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<void>,
  label: string
) {
  const total = items.length;
  for (let i = 0; i < total; i += batchSize) {
    const batch = items.slice(i, Math.min(i + batchSize, total));
    await processor(batch);
    totalProcessed += batch.length;
    logProgress(`${label}: Processed ${totalProcessed}/${total} (${((totalProcessed / total) * 100).toFixed(1)}%)`);
  }
}

// Step 1: Migrate markdown files
async function migrateMarkdownFiles() {
  logProgress('Starting markdown files migration...');

  const files = fs.readdirSync(MARKDOWN_DIR).filter(f => f.endsWith('.md'));
  logProgress(`Found ${files.length} markdown files`);

  totalProcessed = 0;
  const wordData: Array<{ word: string; content: string }> = [];

  for (const file of files) {
    const word = path.basename(file, '.md');
    const content = fs.readFileSync(path.join(MARKDOWN_DIR, file), 'utf-8');
    wordData.push({ word, content });
  }

  await processBatch(
    wordData,
    BATCH_SIZE,
    async (batch) => {
      await prisma.$transaction(async (tx) => {
        for (const { word, content } of batch) {
          // Create or get Word entry
          const wordEntry = await tx.word.upsert({
            where: { word },
            create: { word },
            update: {},
          });

          // Create or update WordMarkdown
          await tx.wordMarkdown.upsert({
            where: { word },
            create: {
              wordId: wordEntry.id,
              word,
              content,
            },
            update: {
              content,
            },
          });
        }
      });
    },
    'Markdown files'
  );

  logProgress(`Completed markdown migration: ${files.length} files`);
}

// Step 2: Migrate Chinese JSON files
async function migrateChineseFiles() {
  logProgress('Starting Chinese JSON files migration...');

  const files = fs.readdirSync(CHINESE_DIR).filter(f => f.endsWith('.json'));
  logProgress(`Found ${files.length} Chinese JSON files`);

  totalProcessed = 0;
  const chineseData: Array<WordChineseData & { wordId?: string }> = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(CHINESE_DIR, file), 'utf-8');
      const data: WordChineseData = JSON.parse(content);
      // Use filename as fallback if word field is missing
      if (!data.word) {
        data.word = file.replace('.json', '');
      }
      chineseData.push(data);
    } catch (error) {
      logProgress(`Error reading ${file}: ${error}`);
    }
  }

  await processBatch(
    chineseData,
    BATCH_SIZE,
    async (batch) => {
      await prisma.$transaction(async (tx) => {
        for (const data of batch) {
          // Create or get Word entry
          const wordEntry = await tx.word.upsert({
            where: { word: data.word },
            create: { word: data.word },
            update: {},
          });

          // Create or update WordChinese
          await tx.wordChinese.upsert({
            where: { word: data.word },
            create: {
              wordId: wordEntry.id,
              word: data.word,
              pronunciation: data.pronunciation || '',
              conciseDefinition: data.concise_definition || '',
              forms: data.forms || {},
              definitions: data.definitions || [],
              comparison: data.comparison || [],
            },
            update: {
              pronunciation: data.pronunciation || '',
              conciseDefinition: data.concise_definition || '',
              forms: data.forms || {},
              definitions: data.definitions || [],
              comparison: data.comparison || [],
            },
          });
        }
      });
    },
    'Chinese JSON files'
  );

  logProgress(`Completed Chinese migration: ${files.length} files`);
}

// Step 3: Migrate ECDICT CSV
async function migrateEcdictData() {
  logProgress('Starting ECDICT CSV migration...');

  return new Promise<void>((resolve, reject) => {
    const ecdictData: EcdictRow[] = [];

    Papa.parse(fs.createReadStream(ECDICT_FILE, 'utf-8'), {
      header: true,
      skipEmptyLines: true,
      step: (row: Papa.ParseStepResult<any>) => {
        const data = row.data;
        ecdictData.push({
          word: data['单词名称'] || '',
          phonetic: data['音标'] || '',
          translation: data['单词释义（中文）'] || '',
          collins: data['柯林斯星级'] || '',
          tag: data['字符串标签'] || '',
          exchange: data['时态复数等变换'] || '',
        });
      },
      complete: async () => {
        logProgress(`Parsed ${ecdictData.length} ECDICT entries`);
        totalProcessed = 0;

        try {
          await processBatch(
            ecdictData,
            BATCH_SIZE,
            async (batch) => {
              await prisma.$transaction(async (tx) => {
                for (const data of batch) {
                  if (!data.word) continue;

                  // Create or get Word entry
                  const wordEntry = await tx.word.upsert({
                    where: { word: data.word },
                    create: { word: data.word },
                    update: {},
                  });

                  // Create or update WordEcdict
                  await tx.wordEcdict.upsert({
                    where: { word: data.word },
                    create: {
                      wordId: wordEntry.id,
                      word: data.word,
                      phonetic: data.phonetic,
                      translation: data.translation,
                      collins: data.collins,
                      tag: data.tag,
                      exchange: data.exchange,
                    },
                    update: {
                      phonetic: data.phonetic,
                      translation: data.translation,
                      collins: data.collins,
                      tag: data.tag,
                      exchange: data.exchange,
                    },
                  });
                }
              });
            },
            'ECDICT entries'
          );

          logProgress(`Completed ECDICT migration: ${ecdictData.length} entries`);
          resolve();
        } catch (error) {
          reject(error);
        }
      },
      error: (error: Error) => {
        reject(error);
      },
    });
  });
}

// Step 4: Migrate Word Fission CSV
async function migrateFissionData() {
  logProgress('Starting Word Fission CSV migration...');

  return new Promise<void>((resolve, reject) => {
    const fissionData: FissionRow[] = [];

    Papa.parse(fs.createReadStream(FISSION_FILE, 'utf-8'), {
      header: true,
      skipEmptyLines: true,
      step: (row: Papa.ParseStepResult<any>) => {
        const data = row.data;
        fissionData.push({
          word: data['word'] || '',
          part_of_speech: data['part_of_speech'] || '',
          meaning_number: data['meaning_number'] || '',
          definition_text: data['definition_text'] || '',
          synonym: data['synonym'] || '',
        });
      },
      complete: async () => {
        logProgress(`Parsed ${fissionData.length} Word Fission entries`);
        totalProcessed = 0;

        try {
          await processBatch(
            fissionData,
            BATCH_SIZE,
            async (batch) => {
              await prisma.$transaction(async (tx) => {
                for (const data of batch) {
                  if (!data.word) continue;

                  // Create or get Word entry
                  const wordEntry = await tx.word.upsert({
                    where: { word: data.word },
                    create: { word: data.word },
                    update: {},
                  });

                  // Create WordFission entry (no upsert, as there can be multiple)
                  await tx.wordFission.create({
                    data: {
                      wordId: wordEntry.id,
                      word: data.word,
                      partOfSpeech: data.part_of_speech,
                      meaningNumber: data.meaning_number,
                      definitionText: data.definition_text,
                      synonym: data.synonym,
                    },
                  });
                }
              });
            },
            'Word Fission entries'
          );

          logProgress(`Completed Word Fission migration: ${fissionData.length} entries`);
          resolve();
        } catch (error) {
          reject(error);
        }
      },
      error: (error: Error) => {
        reject(error);
      },
    });
  });
}

// Main migration function
async function main() {
  const startTime = Date.now();
  logProgress('=== Starting Data Migration ===');

  try {
    // Clear existing data (optional - comment out if you want to preserve existing data)
    logProgress('Clearing existing word data...');
    await prisma.wordFission.deleteMany({});
    await prisma.wordEcdict.deleteMany({});
    await prisma.wordChinese.deleteMany({});
    await prisma.wordMarkdown.deleteMany({});
    await prisma.word.deleteMany({});
    logProgress('Existing data cleared');

    // Run migrations in sequence
    await migrateMarkdownFiles();
    await migrateChineseFiles();
    await migrateEcdictData();
    await migrateFissionData();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logProgress(`=== Migration Completed Successfully in ${duration}s ===`);

    // Print summary
    const wordCount = await prisma.word.count();
    const markdownCount = await prisma.wordMarkdown.count();
    const chineseCount = await prisma.wordChinese.count();
    const ecdictCount = await prisma.wordEcdict.count();
    const fissionCount = await prisma.wordFission.count();

    console.log('\n=== Migration Summary ===');
    console.log(`Total Words: ${wordCount}`);
    console.log(`Markdown Entries: ${markdownCount}`);
    console.log(`Chinese Entries: ${chineseCount}`);
    console.log(`ECDICT Entries: ${ecdictCount}`);
    console.log(`Fission Relations: ${fissionCount}`);
  } catch (error) {
    logProgress(`Migration failed: ${error}`);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

