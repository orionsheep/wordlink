/**
 * Ambient 沉浸式阅读 —— 精选短文种子内容（方案 B 兜底库）。
 * 演示环境零外部依赖：首次访问列表接口时自动落库。
 */

export interface AmbientParagraph {
    en: string;
    zh?: string;
    audioUrl?: string;
}

export interface SeedArticle {
    title: string;
    titleZh: string;
    level: 'A2' | 'B1' | 'B2' | 'C1';
    season: 'spring' | 'summer' | 'autumn' | 'winter';
    paragraphs: AmbientParagraph[];
}

export const CURATED_ARTICLES: SeedArticle[] = [
    {
        title: 'The First Rain of April',
        titleZh: '四月的第一场雨',
        level: 'B1',
        season: 'spring',
        paragraphs: [
            { en: 'The first rain of April fell softly on the waking earth.', zh: '四月的第一场雨，轻柔地落在苏醒的大地上。' },
            { en: 'It did not rush. It arrived like a guest who knows the door is always open.', zh: '它并不匆忙，而是像一位深知门常开的客人，悄然到来。' },
            { en: 'Every seed under the soil heard the same message: it is time.', zh: '泥土下的每一粒种子都听到了同一个讯息：是时候了。' },
            { en: 'By evening, the hills had turned a shade of green that did not exist that morning.', zh: '到傍晚时分，群山已染上一层清晨还不存在的绿意。' },
            { en: 'Nothing in nature shouts. It simply begins, again and again.', zh: '自然界从不喧哗，它只是开始，一次又一次。' },
        ],
    },
    {
        title: 'Fireflies at Dusk',
        titleZh: '黄昏的萤火虫',
        level: 'A2',
        season: 'summer',
        paragraphs: [
            { en: 'When the sun went down, the field began to breathe with light.', zh: '太阳落下后，原野开始随光呼吸。' },
            { en: 'Fireflies rose from the grass like small, patient stars.', zh: '萤火虫从草丛中升起，像一颗颗耐心的小星星。' },
            { en: 'They do not hurry, and yet they are never late.', zh: '它们从不匆忙，却也从不迟到。' },
            { en: 'A child watched from the porch and forgot to ask for anything else.', zh: '孩子在门廊上望着，忘了再要别的什么。' },
            { en: 'Some gifts cannot be held. They can only be witnessed.', zh: '有些礼物无法握在手中，只能见证。' },
        ],
    },
    {
        title: 'Leaves and Letting Go',
        titleZh: '落叶与放手',
        level: 'B2',
        season: 'autumn',
        paragraphs: [
            { en: 'In October, the forest teaches its hardest lesson: how to let go.', zh: '十月，森林教授它最艰难的一课：如何放手。' },
            { en: 'Each leaf lets go not because it is weak, but because the branch has kept its promise.', zh: '每一片落叶的离开，不是因为软弱，而是因为枝头已兑现了承诺。' },
            { en: 'The colors we call beautiful are simply the leaf saying goodbye honestly.', zh: '我们称之为绚烂的色彩，不过是叶子在诚实地道别。' },
            { en: 'What falls is not lost. It becomes the warmth of the next spring.', zh: '坠落并非失去，它将成为下一个春天的温暖。' },
            { en: 'We walk through the fallen leaves and hear the sound of courage.', zh: '我们走过落叶，听见的是勇气的声音。' },
        ],
    },
    {
        title: 'The Quiet of Snow',
        titleZh: '雪的寂静',
        level: 'B1',
        season: 'winter',
        paragraphs: [
            { en: 'Snow does not knock before it enters the world.', zh: '雪降临世界之前，从不会敲门。' },
            { en: 'It covers the loud places first, then waits for the quiet ones.', zh: '它先覆盖喧嚣之地，再静静等待安宁之所。' },
            { en: 'Under the white silence, the fields are not sleeping. They are listening.', zh: '在白色的寂静之下，田野并未沉睡，而是在倾听。' },
            { en: 'A single lamp in the window is enough to answer the whole winter sky.', zh: '窗内的一盏孤灯，足以回应整个冬日的天空。' },
            { en: 'And when the snow finally stops, the world feels newly honest.', zh: '当雪终于停歇，世界显得前所未有的坦诚。' },
        ],
    },
];
