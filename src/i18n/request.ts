import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 加载 messages/<locale>.json 主文件,再深度合并 messages/<locale>/*.json 分片文件。
 * 分片让各页面/模块的文案可以独立维护(并行改动互不冲突)。
 */
async function loadMessages(locale: string): Promise<Record<string, unknown>> {
  const base: Record<string, unknown> = (await import(`../../messages/${locale}.json`)).default;

  const dir = path.join(process.cwd(), 'messages', locale);
  if (!fs.existsSync(dir)) return base;

  const merged = { ...base };
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const shard = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const [ns, value] of Object.entries(shard)) {
      merged[ns] =
        value && typeof value === 'object' && !Array.isArray(value) &&
        merged[ns] && typeof merged[ns] === 'object' && !Array.isArray(merged[ns])
          ? { ...(merged[ns] as object), ...(value as object) }
          : value;
    }
  }
  return merged;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  // 默认英文（比赛评审与海外访客直接看到英文版）；中文用户可在设置页切换，会写入 NEXT_LOCALE cookie
  const locale = cookieStore.get('NEXT_LOCALE')?.value === 'zh' ? 'zh' : 'en';

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
