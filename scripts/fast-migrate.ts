import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as crypto from 'crypto';
import Papa from 'papaparse';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

const DATA_DIR = path.join(process.cwd(), 'data');
const CHINESE_DIR = path.join(DATA_DIR, 'word_chinese');
const MARKDOWN_DIR = path.join(DATA_DIR, 'word_text_database', 'word_database');
const FISSION_FILE = path.join(DATA_DIR, 'word_fission_data.csv');
const ECDICT_FILE = path.join(DATA_DIR, 'ecdict_extracted.csv');

const CHUNK_SIZE = 2500;

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function main() {
  const startTime = Date.now();
  log('🚀 开始高速全量数据库迁移 (Local Files -> Supabase PostgreSQL)...');

  // 1. 扫描并构建全局单词字典集合
  log('阶段 1/5: 收集全部全局唯一单词表...');
  const wordMap = new Map<string, string>(); // word -> id

  // 1.1 中文词库
  if (fs.existsSync(CHINESE_DIR)) {
    const cnFiles = fs.readdirSync(CHINESE_DIR).filter(f => f.endsWith('.json'));
    for (const f of cnFiles) {
      const w = f.replace(/\.json$/i, '').trim();
      if (w && !wordMap.has(w)) {
        wordMap.set(w, crypto.randomUUID());
      }
    }
  }

  // 1.2 词源 Markdown
  if (fs.existsSync(MARKDOWN_DIR)) {
    const mdFiles = fs.readdirSync(MARKDOWN_DIR).filter(f => f.endsWith('.md'));
    for (const f of mdFiles) {
      const w = f.replace(/\.md$/i, '').trim();
      if (w && !wordMap.has(w)) {
        wordMap.set(w, crypto.randomUUID());
      }
    }
  }

  // 1.3 裂变 CSV
  if (fs.existsSync(FISSION_FILE)) {
    const fissionStream = fs.createReadStream(FISSION_FILE);
    const rl = readline.createInterface({ input: fissionStream });
    let isHeader = true;
    for await (const line of rl) {
      if (isHeader) { isHeader = false; continue; }
      const parts = line.split(',');
      const w = parts[1]?.trim();
      const syn = parts[5]?.trim();
      if (w && !wordMap.has(w)) wordMap.set(w, crypto.randomUUID());
      if (syn && !wordMap.has(syn)) wordMap.set(syn, crypto.randomUUID());
    }
  }

  // 1.4 ECDICT CSV
  if (fs.existsSync(ECDICT_FILE)) {
    const ecdictContent = fs.readFileSync(ECDICT_FILE, 'utf-8');
    const parsed = Papa.parse(ecdictContent, { header: true, skipEmptyLines: true });
    for (const row of parsed.data as any[]) {
      const w = (row['单词名称'] || '').trim();
      if (w && !wordMap.has(w)) {
        wordMap.set(w, crypto.randomUUID());
      }
    }
  }

  log(`✅ 收集到唯一单词总数: ${wordMap.size}`);

  // 批量写入 words 表
  log('正在高速批量写入 words 表...');
  const wordEntries = Array.from(wordMap.entries()).map(([word, id]) => ({ id, word }));
  for (let i = 0; i < wordEntries.length; i += CHUNK_SIZE) {
    const chunk = wordEntries.slice(i, i + CHUNK_SIZE);
    await prisma.words.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    if ((i + CHUNK_SIZE) % 50000 < CHUNK_SIZE || i + CHUNK_SIZE >= wordEntries.length) {
      log(`  words 表进度: ${Math.min(i + CHUNK_SIZE, wordEntries.length)} / ${wordEntries.length} (${((Math.min(i + CHUNK_SIZE, wordEntries.length) / wordEntries.length) * 100).toFixed(1)}%)`);
    }
  }

  // 获取数据库中已有的全部 word -> id 映射（确保外键 100% 准确）
  log('正在加载数据库 words 映射缓存...');
  const dbWords = await prisma.words.findMany({
    select: { id: true, word: true },
  });
  const wordToId = new Map<string, string>();
  for (const item of dbWords) {
    wordToId.set(item.word, item.id);
  }
  log(`已加载数据库 words 映射缓存，共 ${wordToId.size} 条记录`);

  // 2. 写入 word_chinese 表
  log('阶段 2/5: 正在迁移 word_chinese 数据...');
  if (fs.existsSync(CHINESE_DIR)) {
    const cnFiles = fs.readdirSync(CHINESE_DIR).filter(f => f.endsWith('.json'));
    const chineseBatch: any[] = [];

    for (let i = 0; i < cnFiles.length; i++) {
      const f = cnFiles[i];
      try {
        const filePath = path.join(CHINESE_DIR, f);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const w = (data.word || f.replace(/\.json$/i, '')).trim();
        const wordId = wordToId.get(w);
        if (wordId) {
          chineseBatch.push({
            id: crypto.randomUUID(),
            wordId,
            word: w,
            pronunciation: data.pronunciation || '',
            conciseDefinition: data.concise_definition || '',
            forms: data.forms || {},
            definitions: data.definitions || [],
            comparison: data.comparison || [],
          });
        }
      } catch (err) {
        // Skip invalid file
      }

      if (chineseBatch.length >= CHUNK_SIZE || i === cnFiles.length - 1) {
        if (chineseBatch.length > 0) {
          await prisma.word_chinese.createMany({
            data: chineseBatch,
            skipDuplicates: true,
          });
          chineseBatch.length = 0;
        }
        log(`  word_chinese 进度: ${i + 1} / ${cnFiles.length} (${(((i + 1) / cnFiles.length) * 100).toFixed(1)}%)`);
      }
    }
  }
  log('✅ word_chinese 数据迁移完毕');

  // 3. 写入 word_markdown 表
  log('阶段 3/5: 正在迁移 word_markdown 数据...');
  if (fs.existsSync(MARKDOWN_DIR)) {
    const mdFiles = fs.readdirSync(MARKDOWN_DIR).filter(f => f.endsWith('.md'));
    const mdBatch: any[] = [];

    for (let i = 0; i < mdFiles.length; i++) {
      const f = mdFiles[i];
      try {
        const filePath = path.join(MARKDOWN_DIR, f);
        const content = fs.readFileSync(filePath, 'utf-8');
        const w = f.replace(/\.md$/i, '').trim();
        const wordId = wordToId.get(w);
        if (wordId) {
          mdBatch.push({
            id: crypto.randomUUID(),
            wordId,
            word: w,
            content,
          });
        }
      } catch (err) {
        // Skip invalid file
      }

      if (mdBatch.length >= CHUNK_SIZE || i === mdFiles.length - 1) {
        if (mdBatch.length > 0) {
          await prisma.word_markdown.createMany({
            data: mdBatch,
            skipDuplicates: true,
          });
          mdBatch.length = 0;
        }
        log(`  word_markdown 进度: ${i + 1} / ${mdFiles.length} (${(((i + 1) / mdFiles.length) * 100).toFixed(1)}%)`);
      }
    }
  }
  log('✅ word_markdown 数据迁移完毕');

  // 4. 写入 word_fission 表
  log('阶段 4/5: 正在迁移 word_fission 数据...');
  if (fs.existsSync(FISSION_FILE)) {
    const fileContent = fs.readFileSync(FISSION_FILE, 'utf-8');
    const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
    const fissionBatch: any[] = [];
    const rows = parsed.data as any[];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const w = (row.word || '').trim();
      const syn = (row.synonym || '').trim();
      const wordId = wordToId.get(w);

      if (wordId && w && syn) {
        fissionBatch.push({
          id: crypto.randomUUID(),
          wordId,
          word: w,
          partOfSpeech: row.part_of_speech || '',
          meaningNumber: String(row.meaning_number || ''),
          definitionText: row.definition_text || '',
          synonym: syn,
        });
      }

      if (fissionBatch.length >= CHUNK_SIZE || i === rows.length - 1) {
        if (fissionBatch.length > 0) {
          await prisma.word_fission.createMany({
            data: fissionBatch,
            skipDuplicates: true,
          });
          fissionBatch.length = 0;
        }
        if ((i + 1) % 20000 === 0 || i === rows.length - 1) {
          log(`  word_fission 进度: ${i + 1} / ${rows.length} (${(((i + 1) / rows.length) * 100).toFixed(1)}%)`);
        }
      }
    }
  }
  log('✅ word_fission 数据迁移完毕');

  // 5. 写入 word_ecdict 表
  log('阶段 5/5: 正在迁移 word_ecdict 数据...');
  if (fs.existsSync(ECDICT_FILE)) {
    const fileContent = fs.readFileSync(ECDICT_FILE, 'utf-8');
    const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
    const ecdictBatch: any[] = [];
    const rows = parsed.data as any[];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const w = (row['单词名称'] || '').trim();
      const wordId = wordToId.get(w);

      if (wordId && w) {
        ecdictBatch.push({
          id: crypto.randomUUID(),
          wordId,
          word: w,
          phonetic: row['音标'] || '',
          translation: row['单词释义（中文）'] || '',
          collins: row['柯林斯星级'] || '',
          tag: row['字符串标签'] || '',
          exchange: row['时态复数等变换'] || '',
        });
      }

      if (ecdictBatch.length >= CHUNK_SIZE || i === rows.length - 1) {
        if (ecdictBatch.length > 0) {
          await prisma.word_ecdict.createMany({
            data: ecdictBatch,
            skipDuplicates: true,
          });
          ecdictBatch.length = 0;
        }
        if ((i + 1) % 50000 === 0 || i === rows.length - 1) {
          log(`  word_ecdict 进度: ${i + 1} / ${rows.length} (${(((i + 1) / rows.length) * 100).toFixed(1)}%)`);
        }
      }
    }
  }
  log('✅ word_ecdict 数据迁移完毕');

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  log(`🎉 全量迁移圆满完成！总耗时: ${totalTime}s`);
}

main()
  .catch((err) => {
    console.error('❌ 迁移异常:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
