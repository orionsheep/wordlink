/**
 * 形近词边 + 词族并查集
 * 用法: tsx scripts/build-spelling-edges.ts
 * 追加 spelling_similar 边到 data/word_relation_edges.csv；另写 data/word_families.csv
 * 移植自词汇星图 utils/scripts/word_similarity.py 的思路：
 *   dice = 2·LCS/(a+b) ≥ 0.75  →  整数判定 8·LCS ≥ 3·(a+b)
 *   长度带 + 字符多重集上界剪枝；同族（inflection/derivative 边连通）不产形近边
 */
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

const DATA_DIR = path.join(process.cwd(), 'data');
const EDGES_FILE = path.join(DATA_DIR, 'word_relation_edges.csv');
const CHINESE_DIR = path.join(DATA_DIR, 'word_chinese');
const FAMILIES_FILE = path.join(DATA_DIR, 'word_families.csv');

interface EdgeRow {
  word: string; target: string; relation_type: string;
  part_of_speech: string; meaning_number: string; definition_text: string; source: string;
}

// ---------- 并查集 ----------
const parent = new Map<string, string>();
function find(x: string): string {
  let r = parent.get(x) ?? x;
  if (r !== x) { r = find(r); parent.set(x, r); }
  return r;
}
function union(a: string, b: string): void {
  const ra = find(a), rb = find(b);
  if (ra === rb) return;
  parent.set(ra < rb ? ra : rb, ra < rb ? rb : ra);
}

// ---------- LCS（位并行太复杂则退回 DP；25k 词分桶后量小）----------
function lcsLength(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;
  let prev = new Uint16Array(n + 1), curr = new Uint16Array(n + 1);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function charCounts(w: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of w) m.set(c, (m.get(c) || 0) + 1);
  return m;
}
function multisetBound(a: Map<string, number>, b: Map<string, number>): number {
  let s = 0;
  for (const [c, n] of a) s += Math.min(n, b.get(c) || 0);
  return s;
}

async function main(): Promise<void> {
  // 1) 词表 = word_chinese 词干
  const vocab = fs.readdirSync(CHINESE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace(/\.json$/, ''));
  const vocabSet = new Set(vocab);
  console.log(`词表: ${vocab.length} 词`);

  // 2) 读已有边 → 建词族并查集 + 已存在 (word,target) 对登记
  const parsed = Papa.parse<EdgeRow>(fs.readFileSync(EDGES_FILE, 'utf8'), {
    header: true, skipEmptyLines: true,
  });
  const rows = parsed.data;
  const pairSeen = new Set<string>(rows.map(r => `${r.word}|${r.target}`));
  let famInput = 0;
  for (const r of rows) {
    if ((r.relation_type === 'inflection' || r.relation_type === 'derivative') &&
        vocabSet.has(r.word) && vocabSet.has(r.target)) {
      union(r.word, r.target); famInput++;
    }
  }
  console.log(`词族合并输入边: ${famInput}`);

  // 3) 词族输出 word,family_id
  const familyOf = (w: string) => find(w);
  const famMap = new Map<string, string[]>();
  for (const w of vocab) {
    const f = familyOf(w);
    if (f !== w || parent.has(w)) {
      const arr = famMap.get(f) || []; arr.push(w); famMap.set(f, arr);
    }
  }
  const famLines = ['word,family_id'];
  for (const w of vocab) {
    const f = familyOf(w);
    if (f !== w) famLines.push(`${w},${f}`);
  }
  fs.writeFileSync(FAMILIES_FILE, famLines.join('\n'));
  const multiFam = [...famMap.values()].filter(a => a.length > 1);
  console.log(`词族: ${multiFam.length} 个多成员族 / ${famLines.length - 1} 个有族词`);

  // 4) LCS 形近对（限词表内，长度带分桶）
  const byLen = new Map<number, string[]>();
  for (const w of vocab) {
    const arr = byLen.get(w.length) || []; arr.push(w); byLen.set(w.length, arr);
  }
  const counts = new Map<string, Map<string, number>>();
  for (const w of vocab) counts.set(w, charCounts(w));

  const sameFamily = (a: string, b: string) => find(a) === find(b);
  const candidates: Array<[string, string]> = [];
  let compared = 0, prunedLen = 0, prunedMulti = 0;
  const lengths = [...byLen.keys()].sort((a, b) => a - b);

  for (const la of lengths) {
    // dice≥0.75 要求 lb/la ∈ [3/5, 5/3]
    const lo = Math.ceil((3 * la) / 5), hi = Math.floor((5 * la) / 3);
    for (const lb of lengths) {
      if (lb < lo || lb > hi || lb < la) continue;
      const A = byLen.get(la)!, B = byLen.get(lb)!;
      for (let i = 0; i < A.length; i++) {
        const a = A[i];
        for (let j = (lb === la ? i + 1 : 0); j < B.length; j++) {
          const b = B[j];
          compared++;
          // 上界1: LCS ≤ min(la,lb) —— 已由长度带保证可能达标，不再剪
          // 上界2: LCS ≤ 字符多重集交集
          if (8 * multisetBound(counts.get(a)!, counts.get(b)!) < 3 * (la + lb)) { prunedMulti++; continue; }
          const lcs = lcsLength(a, b);
          if (8 * lcs >= 3 * (la + lb)) candidates.push([a, b]);
        }
      }
    }
  }
  console.log(`比较 ${compared} 对, 多重集剪枝 ${prunedMulti}, 候选形近 ${candidates.length}`);

  // 5) 过滤：去自环/已存在对/同族/已有任意关系边
  const newEdges: string[] = [];
  let droppedFam = 0, droppedSeen = 0;
  for (const [a, b] of candidates) {
    if (a === b || pairSeen.has(`${a}|${b}`) || pairSeen.has(`${b}|${a}`)) { droppedSeen++; continue; }
    if (sameFamily(a, b)) { droppedFam++; continue; }
    pairSeen.add(`${a}|${b}`);
    newEdges.push(Papa.unparse([[a, b, 'spelling_similar', '', '', '', 'lcs_index']], { header: false }));
  }
  console.log(`形近边: ${newEdges.length} 条 (同族剔除 ${droppedFam}, 已存在剔除 ${droppedSeen})`);

  fs.appendFileSync(EDGES_FILE, '\n' + newEdges.join('\n'));
  console.log(`✓ 已追加到 ${EDGES_FILE}`);
  console.log('  抽样:', candidates.slice(0, 10).map(([a, b]) => `${a}↔${b}`).join(', '));
}

main().catch(e => { console.error(e); process.exit(1); });
