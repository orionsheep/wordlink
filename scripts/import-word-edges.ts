/**
 * 把 data/word_relation_edges.csv 导入 word_relation 表（幂等 upsert）
 * 用法: tsx scripts/import-word-edges.ts [--dry-run] [--batch N]
 * 需要本地 postgres（docker compose up -d postgres），.env.local 指向 localhost:5432
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

const prisma = new PrismaClient();
const EDGES_FILE = path.join(process.cwd(), 'data', 'word_relation_edges.csv');
const DRY_RUN = process.argv.includes('--dry-run');
const batchIdx = process.argv.indexOf('--batch');
const BATCH = batchIdx > 0 ? parseInt(process.argv[batchIdx + 1]) || 500 : 500;

interface EdgeRow {
  word: string; target: string; relation_type: string;
  part_of_speech: string; meaning_number: string; definition_text: string; source: string;
}

async function main(): Promise<void> {
  const parsed = Papa.parse<EdgeRow>(fs.readFileSync(EDGES_FILE, 'utf8'), {
    header: true, skipEmptyLines: true,
  });
  const rows = parsed.data.filter(r => r.word && r.target && r.relation_type);
  console.log(`读取 ${rows.length} 条边`);

  // 1) 解析 words 表映射（source/target 两侧一次拿全）
  const lemmas = new Set<string>();
  rows.forEach(r => { lemmas.add(r.word); lemmas.add(r.target); });
  const lemmaArr = [...lemmas];
  const found = new Map<string, string>();
  const CHUNK = 5000;
  for (let i = 0; i < lemmaArr.length; i += CHUNK) {
    const ws = await prisma.words.findMany({
      where: { word: { in: lemmaArr.slice(i, i + CHUNK) } },
      select: { id: true, word: true },
    });
    ws.forEach(w => found.set(w.word, w.id));
  }
  console.log(`words 表命中 ${found.size} / ${lemmas.size} 个不同 lemma`);

  // 2) 组数据 + status
  const records = rows.map(r => ({
    wordId: found.get(r.word) ?? null,
    word: r.word,
    target: r.target,
    targetWordId: found.get(r.target) ?? null,
    relationType: r.relation_type,
    partOfSpeech: r.part_of_speech || '',
    meaningNumber: r.meaning_number || '',
    definitionText: r.definition_text || '',
    status: found.has(r.target) ? 'linked' : 'lemma_only',
    source: r.source || '',
    confidence: null as number | null,
  }));
  const linked = records.filter(r => r.targetWordId).length;
  const placeholder = records.length - linked;
  console.log(`linked(双端在库) ${linked} / lemma_only(目标占位) ${placeholder}`);

  if (DRY_RUN) { console.log('--dry-run, 不写库'); return; }

  // 3) 分批 createMany + skipDuplicates（幂等；按 @@unique 去重，重跑安全）
  let done = 0, failed = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    try {
      const r = await prisma.word_relation.createMany({ data: batch, skipDuplicates: true });
      done += r.count;
    } catch (e) {
      failed += batch.length;
      console.error(`批次 ${i} 失败:`, (e as Error).message.slice(0, 300));
    }
    if ((i / BATCH) % 20 === 0) console.log(`  进度 ${i}/${records.length}`);
  }
  console.log(`✓ 新增写入 ${done} 条（重复自动跳过）, 失败 ${failed} 条`);
  const total = await prisma.word_relation.count();
  console.log(`word_relation 表现存 ${total} 行`);
}

main().catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
