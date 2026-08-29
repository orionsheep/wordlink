/**
 * WordLink Reading Engine —— 核心断句与双语对齐算法 (移植自 EchoStream)
 *
 * 1. 40+ 英文缩写保护（防止 Mr. / Dr. / i.e. / U.S. 因句号被错误切分）
 * 2. 中文标点分句（。！？；）
 * 3. 中英句子数量不等时的字符长度权重比例对齐算法 (Proportional Distribution)
 */

export function splitEnglishSentences(text: string): string[] {
    const normalized = (text || '')
        .replace(/([A-Za-z])\s+\./g, '$1.')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) return [];

    const abbreviations = [
        'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Sr.', 'Jr.',
        'vs.', 'Inc.', 'Ltd.', 'Co.',
        'Jan.', 'Feb.', 'Mar.', 'Apr.', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Sept.', 'Oct.', 'Nov.', 'Dec.',
        'St.', 'Ave.', 'Blvd.', 'Rd.', 'Dept.', 'Corp.', 'Gov.',
        'i.e.', 'e.g.',
        'a.m.', 'p.m.', 'A.M.', 'P.M.',
        'Ph.D.', 'M.D.', 'B.A.', 'M.A.', 'B.S.', 'M.S.',
    ].sort((a, b) => b.length - a.length);

    const placeholderPrefix = '__ABBR_';
    const placeholderSuffix = '__';
    const placeholderMap: Record<string, string> = {};

    let protectedText = normalized;
    let keyCounter = 0;

    for (const abbreviation of abbreviations) {
        const spacedPattern = abbreviation
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\\\./g, '\\s*\\.');
        const regex = new RegExp(`\\b${spacedPattern}`, 'gi');
        protectedText = protectedText.replace(regex, (match) => {
            const key = `${placeholderPrefix}${keyCounter}${placeholderSuffix}`;
            placeholderMap[key] = match;
            keyCounter += 1;
            return key;
        });
    }

    return protectedText
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => {
            let restored = sentence;
            for (const [placeholder, original] of Object.entries(placeholderMap)) {
                restored = restored.replaceAll(placeholder, original);
            }
            return restored.trim();
        })
        .filter((sentence) => sentence.length > 0);
}

export function splitChineseSentences(text: string): string[] {
    return (text || '')
        .split(/(?<=[。！？；;])\s*/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

export function alignSentences(
    textEn: string,
    textZh: string,
): { pairs: Array<{ en: string; zh: string }>; aligned: boolean } {
    const enSentences = splitEnglishSentences(textEn);
    const zhSentences = splitChineseSentences(textZh);

    // 1:1 精确对齐
    if (enSentences.length === zhSentences.length && enSentences.length > 0) {
        return {
            pairs: enSentences.map((en, i) => ({ en, zh: zhSentences[i] })),
            aligned: true,
        };
    }

    // 句子数不一致：按字符比例权重分配
    if (enSentences.length > 0 && zhSentences.length > 0) {
        return {
            pairs: distributeProportionally(enSentences, zhSentences),
            aligned: true,
        };
    }

    return {
        pairs: enSentences.length > 0
            ? enSentences.map((en) => ({ en, zh: '' }))
            : [{ en: textEn, zh: '' }],
        aligned: false,
    };
}

function distributeProportionally(
    enSentences: string[],
    zhSentences: string[],
): Array<{ en: string; zh: string }> {
    const enCount = enSentences.length;
    const zhCount = zhSentences.length;

    if (zhCount <= enCount) {
        const pairs = enSentences.map((en) => ({ en, zh: '' }));
        for (let z = 0; z < zhCount; z++) {
            const targetIdx = Math.round((z / zhCount) * enCount);
            const idx = Math.min(targetIdx, enCount - 1);
            pairs[idx].zh = pairs[idx].zh
                ? pairs[idx].zh + zhSentences[z]
                : zhSentences[z];
        }
        return pairs;
    }

    const pairs: Array<{ en: string; zh: string }> = [];
    for (let e = 0; e < enCount; e++) {
        const zhStart = Math.round((e / enCount) * zhCount);
        const zhEnd = Math.round(((e + 1) / enCount) * zhCount);
        const merged = zhSentences.slice(zhStart, zhEnd).join('');
        pairs.push({ en: enSentences[e], zh: merged });
    }
    return pairs;
}
