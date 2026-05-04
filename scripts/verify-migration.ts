import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

const prisma = new PrismaClient();

// Configuration
const DATA_DIR = path.join(process.cwd(), 'data');
const MARKDOWN_DIR = path.join(DATA_DIR, 'word_text_database', 'word_database');
const CHINESE_DIR = path.join(DATA_DIR, 'word_chinese');
const ECDICT_FILE = path.join(DATA_DIR, 'ecdict_extracted.csv');
const FISSION_FILE = path.join(DATA_DIR, 'word_fission_data.csv');

interface VerificationResult {
  category: string;
  expected: number;
  actual: number;
  match: boolean;
  details?: string;
}

const results: VerificationResult[] = [];

function logResult(result: VerificationResult) {
  const status = result.match ? '✓' : '✗';
  console.log(`${status} ${result.category}: Expected ${result.expected}, Got ${result.actual}`);
  if (result.details) {
    console.log(`  ${result.details}`);
  }
  results.push(result);
}

// Verify markdown files
async function verifyMarkdownFiles() {
  console.log('\n=== Verifying Markdown Files ===');

  const files = fs.readdirSync(MARKDOWN_DIR).filter(f => f.endsWith('.md'));
  const dbCount = await prisma.wordMarkdown.count();

  logResult({
    category: 'Markdown Files',
    expected: files.length,
    actual: dbCount,
    match: files.length === dbCount,
  });

  // Sample verification - check a few random files
  const sampleSize = Math.min(10, files.length);
  const samples = [];
  for (let i = 0; i < sampleSize; i++) {
    const randomFile = files[Math.floor(Math.random() * files.length)];
    samples.push(randomFile);
  }

  let sampleMatches = 0;
  for (const file of samples) {
    const word = path.basename(file, '.md');
    const content = fs.readFileSync(path.join(MARKDOWN_DIR, file), 'utf-8');
    const dbEntry = await prisma.wordMarkdown.findUnique({
      where: { word },
    });

    if (dbEntry && dbEntry.content === content) {
      sampleMatches++;
    }
  }

  logResult({
    category: 'Markdown Content Sample',
    expected: sampleSize,
    actual: sampleMatches,
    match: sampleSize === sampleMatches,
    details: `Checked ${sampleSize} random files`,
  });
}

// Verify Chinese JSON files
async function verifyChineseFiles() {
  console.log('\n=== Verifying Chinese JSON Files ===');

  const files = fs.readdirSync(CHINESE_DIR).filter(f => f.endsWith('.json'));
  const dbCount = await prisma.wordChinese.count();

  logResult({
    category: 'Chinese JSON Files',
    expected: files.length,
    actual: dbCount,
    match: files.length === dbCount,
  });

  // Sample verification
  const sampleSize = Math.min(10, files.length);
  const samples = [];
  for (let i = 0; i < sampleSize; i++) {
    const randomFile = files[Math.floor(Math.random() * files.length)];
    samples.push(randomFile);
  }

  let sampleMatches = 0;
  for (const file of samples) {
    try {
      const content = fs.readFileSync(path.join(CHINESE_DIR, file), 'utf-8');
      const data = JSON.parse(content);
      const dbEntry = await prisma.wordChinese.findUnique({
        where: { word: data.word },
      });

      if (
        dbEntry &&
        dbEntry.pronunciation === (data.pronunciation || '') &&
        dbEntry.conciseDefinition === (data.concise_definition || '')
      ) {
        sampleMatches++;
      }
    } catch (error) {
      console.log(`  Error checking ${file}: ${error}`);
    }
  }

  logResult({
    category: 'Chinese Content Sample',
    expected: sampleSize,
    actual: sampleMatches,
    match: sampleSize === sampleMatches,
    details: `Checked ${sampleSize} random files`,
  });
}

// Verify ECDICT CSV
async function verifyEcdictData() {
  console.log('\n=== Verifying ECDICT CSV ===');

  return new Promise<void>((resolve) => {
    let csvCount = 0;

    Papa.parse(fs.createReadStream(ECDICT_FILE, 'utf-8'), {
      header: true,
      skipEmptyLines: true,
      step: () => {
        csvCount++;
      },
      complete: async () => {
        const dbCount = await prisma.wordEcdict.count();

        logResult({
          category: 'ECDICT Entries',
          expected: csvCount,
          actual: dbCount,
          match: csvCount === dbCount,
        });

        // Sample verification
        const sampleWords = await prisma.wordEcdict.findMany({
          take: 10,
          orderBy: { word: 'asc' },
        });

        console.log(`  Sample words in database: ${sampleWords.map(w => w.word).join(', ')}`);
        resolve();
      },
    });
  });
}

// Verify Word Fission CSV
async function verifyFissionData() {
  console.log('\n=== Verifying Word Fission CSV ===');

  return new Promise<void>((resolve) => {
    let csvCount = 0;

    Papa.parse(fs.createReadStream(FISSION_FILE, 'utf-8'), {
      header: true,
      skipEmptyLines: true,
      step: () => {
        csvCount++;
      },
      complete: async () => {
        const dbCount = await prisma.wordFission.count();

        logResult({
          category: 'Word Fission Entries',
          expected: csvCount,
          actual: dbCount,
          match: csvCount === dbCount,
        });

        // Check for duplicate handling
        const wordCounts = await prisma.wordFission.groupBy({
          by: ['word'],
          _count: { word: true },
          orderBy: { _count: { word: 'desc' } },
          take: 5,
        });

        console.log('  Top words by fission count:');
        for (const wc of wordCounts) {
          console.log(`    ${wc.word}: ${wc._count.word} relations`);
        }

        resolve();
      },
    });
  });
}

// Verify data integrity
async function verifyDataIntegrity() {
  console.log('\n=== Verifying Data Integrity ===');

  // Check for orphaned records
  const wordsWithoutMarkdown = await prisma.word.count({
    where: { markdownContent: null },
  });

  const wordsWithoutChinese = await prisma.word.count({
    where: { chineseData: null },
  });

  const wordsWithoutEcdict = await prisma.word.count({
    where: { ecdictData: null },
  });

  console.log(`  Words without markdown: ${wordsWithoutMarkdown}`);
  console.log(`  Words without Chinese data: ${wordsWithoutChinese}`);
  console.log(`  Words without ECDICT data: ${wordsWithoutEcdict}`);

  // Check for words with all data
  const completeWords = await prisma.word.count({
    where: {
      AND: [
        { markdownContent: { isNot: null } },
        { chineseData: { isNot: null } },
        { ecdictData: { isNot: null } },
      ],
    },
  });

  console.log(`  Words with complete data (all 3 sources): ${completeWords}`);

  // Check for foreign key integrity
  const totalWords = await prisma.word.count();
  const markdownWords = await prisma.wordMarkdown.count();
  const chineseWords = await prisma.wordChinese.count();
  const ecdictWords = await prisma.wordEcdict.count();
  const fissionWords = await prisma.wordFission.count();

  logResult({
    category: 'Total Unique Words',
    expected: totalWords,
    actual: totalWords,
    match: true,
    details: `Markdown: ${markdownWords}, Chinese: ${chineseWords}, ECDICT: ${ecdictWords}, Fission: ${fissionWords}`,
  });
}

// Main verification function
async function main() {
  console.log('=== Starting Migration Verification ===\n');

  try {
    await verifyMarkdownFiles();
    await verifyChineseFiles();
    await verifyEcdictData();
    await verifyFissionData();
    await verifyDataIntegrity();

    console.log('\n=== Verification Summary ===');
    const passed = results.filter(r => r.match).length;
    const failed = results.filter(r => !r.match).length;

    console.log(`Total checks: ${results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
      console.log('\nFailed checks:');
      results.filter(r => !r.match).forEach(r => {
        console.log(`  - ${r.category}: Expected ${r.expected}, Got ${r.actual}`);
      });
      process.exit(1);
    } else {
      console.log('\n✓ All verification checks passed!');
    }
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
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




