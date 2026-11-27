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
        'vs.', 'Inc.', 'Ltd.', 'Co.', 'etc.',
        'Jan.', 'Feb.', 'Mar.', 'Apr.', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Sept.', 'Oct.', 'Nov.', 'Dec.',
        'St.', 'Ave.', 'Blvd.', 'Rd.', 'Dept.', 'Corp.', 'Gov.',
        'i.e.', 'e.g.',
        'a.m.', 'p.m.', 'A.M.', 'P.M.',
        'Ph.D.', 'M.D.', 'B.A.', 'M.A.', 'B.S.', 'M.S.',
    ].sort((a, b) => b.length - a.length);

    // 称谓/前置类缩写：后续常直接接首字母大写的专有名词或并列成分，不应在其句号处切句
    const nonTerminalPrefixAbbrs = new Set([
        'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'gov.', 'st.',
        'dept.', 'vs.', 'i.e.', 'e.g.',
        'jan.', 'feb.', 'mar.', 'apr.', 'jun.', 'jul.', 'aug.', 'sep.', 'sept.', 'oct.', 'nov.', 'dec.',
    ]);

    const placeholderPrefix = '__ABBR_';
    const placeholderSuffix = '__';
    const splitMarker = '__SENT_SPLIT__';
    const placeholderMap: Record<string, string> = {};

    const combinedPattern = abbreviations
        .map((abbreviation) =>
            abbreviation
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .replace(/\\\./g, '\\s*\\.'),
        )
        .join('|');
    const abbrRegex = new RegExp(`\\b(?:${combinedPattern})`, 'gi');

    let keyCounter = 0;
    const protectedText = normalized.replace(abbrRegex, (match, offset: number, full: string) => {
        const key = `${placeholderPrefix}${keyCounter}${placeholderSuffix}`;
        placeholderMap[key] = match;
        keyCounter += 1;

        const canonical = match.replace(/\s+/g, '').toLowerCase();
        if (!nonTerminalPrefixAbbrs.has(canonical)) {
            const after = full.slice(offset + match.length);
            if (/^\s+(?:["'“‘(\[]\s*)?[A-Z]/.test(after)) {
                return `${key}${splitMarker}`;
            }
        }
        return key;
    });

    return protectedText
        .split(/(?:(?<=[.!?])\s+|__SENT_SPLIT__\s+)/)
        .map((sentence) => {
            let restored = sentence.replaceAll(splitMarker, '');
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
