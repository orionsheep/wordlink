import {
  getEnrichedWordData,
  getWordDetails,
  getFissionData,
  getQuizDataForWords,
  getQuizWords,
  getWordList,
  getLibraryList,
  getLibraryWords,
  getLibraryGroups,
} from '../src/lib/data';
import { prisma } from '../src/lib/prisma';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 WordLink 数据库与功能全量回归测试 & 性能压测');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, title: string, details?: any) {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ [PASS] ${title}`);
    } else {
      console.error(`❌ [FAIL] ${title}`, details || '');
    }
  }

  // 1. 测试基础词汇详情查询
  console.log('\n--- 1. 测试 getEnrichedWordData ---');
  const t0 = performance.now();
  const testWord = 'abandon';
  const data = await getEnrichedWordData(testWord);
  const t1 = performance.now();
  console.log(`查询耗时: ${(t1 - t0).toFixed(2)}ms`);

  assert(!!data, '查询到 abandon 的词典数据');
  assert(data?.word === 'abandon', '单词名称正确匹配');
  assert(!!data?.pronunciation, `包含发音: ${data?.pronunciation}`);
  assert(!!data?.concise_definition, `包含简明释义: ${data?.concise_definition?.slice(0, 30)}...`);
  assert(Array.isArray(data?.definitions) && data.definitions.length > 0, `包含完整中英释义 (共 ${data?.definitions.length} 条)`);

  // 2. 测试缓存性能（第二次查询）
  console.log('\n--- 2. 测试 LRU 内存缓存加速 ---');
  const t2 = performance.now();
  const cachedData = await getEnrichedWordData(testWord);
  const t3 = performance.now();
  const cacheLatency = (t3 - t2).toFixed(3);
  console.log(`二次查询(命中缓存)耗时: ${cacheLatency}ms`);
  assert(Number(cacheLatency) < 1.0, `LRU 缓存响应时间 < 1ms (实际: ${cacheLatency}ms)`);
  assert(JSON.stringify(data) === JSON.stringify(cachedData), '缓存内容与初次查询完全一致');

  // 3. 测试 Markdown 词源详情
  console.log('\n--- 3. 测试 getWordDetails (Markdown 词源) ---');
  const mdT0 = performance.now();
  const md = await getWordDetails('abandon');
  const mdT1 = performance.now();
  console.log(`Markdown 查询耗时: ${(mdT1 - mdT0).toFixed(2)}ms`);
  assert(!!md && md.length > 50, `获取到 abandon 的 Markdown 词源 (长度: ${md?.length} 字符)`);
  assert(md?.includes('abandon') || false, 'Markdown 包含单词内容');

  // 4. 测试裂变图谱查询 (getFissionData)
  console.log('\n--- 4. 测试 getFissionData (词汇裂变图谱) ---');
  const fisT0 = performance.now();
  const graph = await getFissionData('complex');
  const fisT1 = performance.now();
  console.log(`裂变图谱查询耗时: ${(fisT1 - fisT0).toFixed(2)}ms`);

  assert(!!graph, '成功获取 complex 裂变图谱');
  assert(graph.nodes.length > 0, `节点数量: ${graph.nodes.length}`);
  assert(graph.links.length > 0, `连线数量: ${graph.links.length}`);
  assert(graph.nodes.some(n => n.id === 'complex' && n.level === 0), '根节点 level 为 0 且 id 正确');
  assert(graph.nodes.some(n => n.level === 1), '包含一级裂变节点 (Level 1)');
  assert(graph.nodes.some(n => n.level === 2), '包含二级裂变节点 (Level 2)');
  assert(Object.keys(graph.definitions || {}).length > 0, '包含词义分组释义字典');

  // 5. 测试批量测验数据获取 (getQuizDataForWords)
  console.log('\n--- 5. 测试 getQuizDataForWords (批量多词一次性极速加载) ---');
  const batchWords = ['apple', 'banana', 'complex', 'abandon', 'network', 'system', 'language', 'database', 'program', 'algorithm'];
  const qT0 = performance.now();
  const quizResults = await getQuizDataForWords(batchWords);
  const qT1 = performance.now();
  console.log(`10个单词批量查询耗时: ${(qT1 - qT0).toFixed(2)}ms`);

  assert(quizResults.length === batchWords.length, `返回数量与请求一致 (${quizResults.length}/10)`);
  assert(quizResults.every(r => r.word && r.chineseData !== undefined), '每个单词均正确解析结构');

  // 6. 测试随机测验词抽取 (getQuizWords)
  console.log('\n--- 6. 测试 getQuizWords (随机测验题库) ---');
  const randomQuiz = await getQuizWords(5);
  assert(randomQuiz.length === 5, `随机抽取 5 道题目`);
  assert(randomQuiz.every(q => !!q.word), '所有抽取的题目均有有效词名');

  // 7. 测试单词搜索与前缀匹配 (getWordList)
  console.log('\n--- 7. 测试 getWordList (前缀快速搜索) ---');
  const searchT0 = performance.now();
  const searchResults = await getWordList('ab');
  const searchT1 = performance.now();
  console.log(`前缀搜索耗时: ${(searchT1 - searchT0).toFixed(2)}ms, 结果数: ${searchResults.length}`);
  assert(searchResults.length > 0, '搜索到匹配的前缀单词');
  assert(searchResults.every(w => w.toLowerCase().startsWith('ab')), '所有结果均以 ab 开头');

  // 8. 测试词库列表与组别读取
  console.log('\n--- 8. 测试公共词库列表与分组 ---');
  const libList = await getLibraryList();
  assert(Array.isArray(libList) && libList.length > 0, `获取公共词库列表 (共 ${libList.length} 个分类/词书)`);

  const firstLibFile = libList.find(l => l.type === 'file');
  if (firstLibFile) {
    const libWords = await getLibraryWords(firstLibFile.path);
    assert(libWords.length > 0, `读取词书 [${firstLibFile.name}] 成功, 词数: ${libWords.length}`);
    const libGroups = await getLibraryGroups(firstLibFile.path, 50);
    assert(libGroups.length > 0, `词书分组成功 (共 ${libGroups.length} 个组)`);
  }

  // 汇总报告
  console.log('\n====================================================');
  console.log(`📊 测试汇总: ${passed}/${total} 项通过 (${((passed / total) * 100).toFixed(1)}%)`);
  if (passed === total) {
    console.log('🎉 恭喜！数据库迁移、全量功能回归测试与极速缓存验证全部完美通过！');
  } else {
    console.error('⚠️ 部分测试未通过，请检查日志。');
  }
  console.log('====================================================');
}

runTests()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
