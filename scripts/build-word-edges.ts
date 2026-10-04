/**
 * 词链边生成：从三类现成数据开挖类型化关系边
 * 用法: tsx scripts/build-word-edges.ts [ecdict|markdown|comparison|all]
 * 输出: data/word_relation_edges.csv
 *   word,target,relation_type,part_of_speech,meaning_number,definition_text,source
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import Papa from 'papaparse';

const DATA_DIR = path.join(process.cwd(), 'data');
const ECDICT_FILE = path.join(DATA_DIR, 'ecdict_extracted.csv');
const MARKDOWN_DIR = path.join(DATA_DIR, 'word_text_database', 'word_database');
const CHINESE_DIR = path.join(DATA_DIR, 'word_chinese');
const OUT_FILE = path.join(DATA_DIR, 'word_relation_edges.csv');

type RelationType = 'synonym' | 'near_synonym' | 'antonym' | 'derivative' | 'inflection' | 'spelling_similar';

interface Edge {
  word: string;
  target: string;
  relation_type: RelationType;
  part_of_speech: string;
  meaning_number: string;
  definition_text: string;
  source: string;
}

const seen = new Set<string>();
const edges: Edge[] = [];
const stats: Record<string, number> = {};

function normalize(raw: string): string {
  const w = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return /^[a-z][a-z '\-]*$/.test(w) && w.length <= 60 ? w : '';
}

function emit(word: string, target: string, type: RelationType, source: string,
              partOfSpeech = '', meaningNumber = '', definitionText = ''): void {
  const w = normalize(word);
  const t = normalize(target);
  if (!w || !t || w === t) return;
  const key = `${w}|${t}|${type}|${meaningNumber}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({
    word: w, target: t, relation_type: type,
    part_of_speech: partOfSpeech, meaning_number: meaningNumber,
    definition_text: definitionText, source,
  });
  stats[source] = (stats[source] || 0) + 1;
}

// ---------- 1. ECDICT exchange：词形码 → inflection 边 ----------
// 码表: p=过去式 d=过去分词 i=现在分词 3=三单 s=复数 r=比较级 t=最高级 0=lemma 1=lemma的变换方式
async function buildEcdict(): Promise<void> {
  const rl = readline.createInterface({
    input: fs.createReadStream(ECDICT_FILE, 'utf8'),
    crlfDelay: Infinity,
  });
  let header: string[] | null = null;
  let buffer: string[] = [];
  for await (const line of rl) {
    buffer.push(line);
    const text = buffer.join('\n');
    const parsed = Papa.parse(text, { skipEmptyLines: true });
    if (parsed.errors.some(e => e.code === 'MissingQuotes')) {
      continue; // 引号未闭合，继续累积行
    }
    buffer = [];
    const row = (parsed.data as string[][])[0];
    if (!row) continue;
    if (!header) {
      header = row;
      continue;
    }
    const [word, , , , exchange] = row;
    if (!word || !exchange) continue;
    for (const pair of exchange.split('/')) {
      const idx = pair.indexOf(':');
      if (idx < 0) continue;
      const code = pair.slice(0, idx).trim();
      const form = pair.slice(idx + 1).trim();
      if (!form) continue;
      if (code === '0') {
        // W 是 form 的词形 → 边(lemma→W)
        emit(form, word, 'inflection', 'ecdict_exchange', '', 'lemma');
      } else if (code !== '1' && /^[pdist3r]$/.test(code)) {
        // W 的某词形 → 边(W→form)，meaning 存词形码
        emit(word, form, 'inflection', 'ecdict_exchange', '', code);
      }
    }
  }
  if (buffer.length) {
    const parsed = Papa.parse(buffer.join('\n'), { skipEmptyLines: true });
    for (const row of parsed.data as string[][]) {
      const [word, , , , exchange] = row;
      if (word && exchange) {
        for (const pair of exchange.split('/')) {
          const idx = pair.indexOf(':');
          if (idx < 0) continue;
          const code = pair.slice(0, idx).trim();
          const form = pair.slice(idx + 1).trim();
          if (!form) continue;
          if (code === '0') emit(form, word, 'inflection', 'ecdict_exchange', '', 'lemma');
          else if (/^[pdist3r]$/.test(code)) emit(word, form, 'inflection', 'ecdict_exchange', '', code);
        }
      }
    }
  }
}

// ---------- 2. markdown 尾部/段内 **[[x]]** *pos* → derivative 边 ----------
const DERIVATIVE_RE = /\*\*\[\[([^\]]+)\]\]\*\*\s*\*([a-zA-Z][a-zA-Z.]*)\*/g;

async function buildMarkdown(): Promise<void> {
  const files = fs.readdirSync(MARKDOWN_DIR).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const headword = file.replace(/\.md$/, '');
    const content = fs.readFileSync(path.join(MARKDOWN_DIR, file), 'utf8');
    for (const m of content.matchAll(DERIVATIVE_RE)) {
      const target = m[1];
      const pos = m[2].replace(/\./g, '');
      // 排除 SYNONYMS 行里的 [[x]]（已被 fission 同义边覆盖）——派生条模式是 **[[x]]** *pos*
      // 该正则天然只命中 **[[ ]]** 双星写法，SYNONYMS 行是 [[x]], 单星/无双星，不会命中
      emit(headword, target, 'derivative', 'markdown_link', pos);
    }
  }
}

// ---------- 3. word_chinese comparison[] → near_synonym 边 ----------
async function buildComparison(): Promise<void> {
  const files = fs.readdirSync(CHINESE_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CHINESE_DIR, file), 'utf8'));
      const word: string = data.word || file.replace(/\.json$/, '');
      const comparisons: Array<{ word_to_compare?: string; analysis?: string }> = data.comparison || [];
      for (const c of comparisons) {
        if (!c.word_to_compare) continue;
        const note = typeof c.analysis === 'string' ? c.analysis.slice(0, 200) : '';
        emit(word, c.word_to_compare, 'near_synonym', 'comparison_json', '', '', note);
      }
    } catch {
      // 单个坏文件跳过
    }
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2] || 'all';
  if (cmd === 'ecdict' || cmd === 'all') await buildEcdict();
  if (cmd === 'markdown' || cmd === 'all') await buildMarkdown();
  if (cmd === 'comparison' || cmd === 'all') await buildComparison();

  edges.sort((a, b) => a.word.localeCompare(b.word) || a.relation_type.localeCompare(b.relation_type));
  const csv = Papa.unparse({
    fields: ['word', 'target', 'relation_type', 'part_of_speech', 'meaning_number', 'definition_text', 'source'],
    data: edges.map(e => [e.word, e.target, e.relation_type, e.part_of_speech, e.meaning_number, e.definition_text, e.source]),
  });
  fs.writeFileSync(OUT_FILE, 'word,target,relation_type,part_of_speech,meaning_number,definition_text,source\n' +
    csv.split('\n').slice(1).join('\n'));

  const byType: Record<string, number> = {};
  edges.forEach(e => { byType[e.relation_type] = (byType[e.relation_type] || 0) + 1; });
  console.log(`✓ ${OUT_FILE}`);
  console.log(`  总边数: ${edges.length}`);
  console.log('  按类型:', JSON.stringify(byType));
  console.log('  按来源:', JSON.stringify(stats));
  console.log('  抽样:', edges.filter(e => e.relation_type !== 'inflection').slice(0, 5)
    .map(e => `${e.word}→${e.target}(${e.relation_type})`).join(', '));
}

main().catch(e => { console.error(e); process.exit(1); });
