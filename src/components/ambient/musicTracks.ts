/**
 * Ambient 背景音乐曲目配置（预留接口）。
 *
 * ▸ 以后接入背景音乐：往 AMBIENT_MUSIC_TRACKS 里加一条即可，UI 自动出现音乐按钮。
 *   - src 填 public 路径（如 '/ambient-music/lofi-rain.mp3'，把文件放进 public/ambient-music/）
 *     或任意外链 URL。
 *   - seasons：可选。绑定了季节的曲目会在切换场景时自动换歌；
 *     未绑定 seasons 的曲目作为通用兜底。
 *   - gain：相对音量系数（0~1），人声朗读类建议调低，纯器乐可到 0.7+。
 *   - loop：是否循环，默认 true。
 */

import type { SeasonId } from './SoundScapeEngine';

export interface AmbientMusicTrack {
    id: string;
    title: string;
    src: string;
    seasons?: SeasonId[];
    /** 相对音量系数，默认 0.55 */
    gain?: number;
    loop?: boolean;
}

export const AMBIENT_MUSIC_TRACKS: AmbientMusicTrack[] = [
    // ── 在这里添加背景音乐，示例 ─────────────────────────────
    // {
    //     id: 'spring-lofi',
    //     title: 'Rainy Lofi',
    //     src: '/ambient-music/spring-lofi.mp3',
    //     seasons: ['spring'],
    //     gain: 0.5,
    // },
    // {
    //     id: 'winter-piano',
    //     title: 'Quiet Piano',
    //     src: '/ambient-music/winter-piano.mp3',
    //     seasons: ['winter'],
    //     gain: 0.6,
    // },
];

/** 按季节挑一首曲子；优先匹配绑定该季节的曲目，否则用第一条未绑定季节的兜底曲目 */
export function pickTrackForSeason(season: SeasonId): AmbientMusicTrack | null {
    if (AMBIENT_MUSIC_TRACKS.length === 0) return null;
    return (
        AMBIENT_MUSIC_TRACKS.find((t) => t.seasons?.includes(season)) ??
        AMBIENT_MUSIC_TRACKS.find((t) => !t.seasons) ??
        null
    );
}
