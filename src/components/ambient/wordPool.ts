/**
 * Ambient 屏保模式的单词卡片数据结构与兜底词池。
 *
 * 主数据源是用户当前词库（localStorage.wordListState.currentPath →
 * /api/library-words），当用户未选词库或接口不可用时，使用这份精心挑选的
 * 兜底词池 —— 保证 /ambient 在任何情况下都能直接播放。
 */

export interface AmbientWordCard {
    word: string;
    phonetic?: string;
    /** 一行释义（中英皆可） */
    definition?: string;
    /** 可选例句 */
    example?: string;
}

export const FALLBACK_WORD_POOL: AmbientWordCard[] = [
    { word: 'serendipity', phonetic: '/ˌserənˈdɪpəti/', definition: 'n. 美丽的意外；不期而遇的幸运', example: 'It was pure serendipity that we met.' },
    { word: 'luminous', phonetic: '/ˈluːmɪnəs/', definition: 'adj. 发光的；明澈的', example: 'The moon was luminous against the dark sky.' },
    { word: 'ephemeral', phonetic: '/ɪˈfemərəl/', definition: 'adj. 短暂的，转瞬即逝的', example: 'Cherry blossoms are ephemeral but unforgettable.' },
    { word: 'solitude', phonetic: '/ˈsɒlɪtjuːd/', definition: 'n. 独处；宁静的孤独', example: 'She found clarity in solitude.' },
    { word: 'resilience', phonetic: '/rɪˈzɪliəns/', definition: 'n. 韧性；复原力', example: 'Resilience grows each time we recover.' },
    { word: 'cascade', phonetic: '/kæˈskeɪd/', definition: 'n./v. 瀑布；层叠倾泻', example: 'Light cascaded through the forest canopy.' },
    { word: 'halcyon', phonetic: '/ˈhælsiən/', definition: 'adj. 宁静美好的，太平的', example: 'Those halcyon days by the sea remain vivid.' },
    { word: 'petrichor', phonetic: '/ˈpetrɪkɔːr/', definition: 'n. 雨后泥土的芬芳', example: 'The petrichor rose after the summer storm.' },
    { word: 'quiescent', phonetic: '/kwiˈesnt/', definition: 'adj. 静止的，沉寂的', example: 'The lake lay quiescent at dawn.' },
    { word: 'aurora', phonetic: '/ɔːˈrɔːrə/', definition: 'n. 极光；曙光', example: 'An aurora unfurled across the polar night.' },
    { word: 'meander', phonetic: '/miˈændər/', definition: 'v. 蜿蜒而行；漫步', example: 'The river meanders through the valley.' },
    { word: 'effervescent', phonetic: '/ˌefəˈvesnt/', definition: 'adj. 冒泡的；活力洋溢的', example: 'Her effervescent laugh filled the room.' },
    { word: 'tranquil', phonetic: '/ˈtræŋkwɪl/', definition: 'adj. 安宁的，平静的', example: 'The garden was tranquil in the evening light.' },
    { word: 'ethereal', phonetic: '/ɪˈθɪəriəl/', definition: 'adj. 空灵的，飘渺的', example: 'Mist gave the mountains an ethereal beauty.' },
    { word: 'reverie', phonetic: '/ˈrevəri/', definition: 'n. 幻想，遐想', example: 'He drifted into a gentle reverie.' },
    { word: 'sonorous', phonetic: '/ˈsɒnərəs/', definition: 'adj. 浑厚低沉的（声音）', example: 'A sonorous bell echoed across the valley.' },
    { word: 'verdant', phonetic: '/ˈvɜːdnt/', definition: 'adj. 翠绿的，苍翠欲滴的', example: 'Verdant hills rolled toward the horizon.' },
    { word: 'lull', phonetic: '/lʌl/', definition: 'n./v. 间歇；使安静', example: 'The lull of the waves eased her mind.' },
    { word: 'gossamer', phonetic: '/ˈɡɒsəmər/', definition: 'adj./n. 轻纱般的；蛛丝', example: 'Gossamer threads caught the morning light.' },
    { word: 'zephyr', phonetic: '/ˈzefər/', definition: 'n. 和风，微风', example: 'A warm zephyr moved through the pines.' },
    { word: 'nocturne', phonetic: '/ˈnɒktɜːn/', definition: 'n. 夜曲；夜景', example: 'Owls performed their own nocturne.' },
    { word: 'iridescent', phonetic: '/ˌɪrɪˈdesnt/', definition: 'adj. 彩虹色的，闪光的', example: 'Iridescent light played on the water.' },
    { word: 'hush', phonetic: '/hʌʃ/', definition: 'n./v. 寂静；使安静', example: 'A hush fell over the snowy field.' },
    { word: 'kindle', phonetic: '/ˈkɪndl/', definition: 'v. 点燃；唤起', example: 'The hearth kindled a soft amber glow.' },
    { word: 'placid', phonetic: '/ˈplæsɪd/', definition: 'adj. 平和的，宁静的', example: 'Placid water mirrored the entire sky.' },
    { word: 'evanescent', phonetic: '/ˌevəˈnesnt/', definition: 'adj. 逐渐消失的，昙花一现的', example: 'Fog is evanescent under rising sun.' },
    { word: 'susurrus', phonetic: '/suːˈsʌrəs/', definition: 'n. 沙沙声，低语声', example: 'The susurrus of leaves was almost a song.' },
    { word: 'gleaming', phonetic: '/ˈɡliːmɪŋ/', definition: 'adj. 闪烁的，发微光的', example: 'Dew lay gleaming on every blade of grass.' },
    { word: 'sepulchral', phonetic: '/sɪˈpʌlkrəl/', definition: 'adj. 幽深回荡的（声音）', example: 'A sepulchral quiet settled over the woods.' },
    { word: 'amber', phonetic: '/ˈæmbər/', definition: 'n./adj. 琥珀色；温黄的', example: 'Amber light spilled from the sunset.' },
    { word: 'drift', phonetic: '/drɪft/', definition: 'v./n. 漂流；悠然移动', example: 'Snowflakes drift past the window.' },
    { word: 'bloom', phonetic: '/bluːm/', definition: 'n./v. 花；绽放', example: 'Ideas bloom in unhurried minds.' },
];

/** 从数组中随机抽取 count 个不重复元素 */
export function sampleWords<T>(arr: T[], count: number): T[] {
    const copy = [...arr];
    const out: T[] = [];
    while (copy.length > 0 && out.length < count) {
        out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return out;
}
