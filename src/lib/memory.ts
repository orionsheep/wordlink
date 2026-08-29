/**
 * Memory State Machine (SM-2 lite)
 * ---------------------------------
 * Single source of truth for UserWordState transitions.
 * Called by /api/quiz/record after every test submission.
 *
 * Design goals:
 *   1. Explainable  — every field transition has a one-line rule.
 *   2. Pure         — no I/O, unit-testable.
 *   3. Aligned      — score semantics come from the quiz pages:
 *        score = 2  -> correct (spelling right / recall "easy")
 *        score = 1  -> shaky  (recall "hard": recognised with effort)
 *        score = 0  -> wrong  (spelling wrong / recall "unknown")
 */

export interface MemoryState {
    stage: 'UNFAMILIAR' | 'FAMILIAR' | 'LEARNED' | 'MASTERED';
    memoryStrength: number;      // 0-10
    stability: number;           // days-like multiplier, >= 1
    repetitionCount: number;
    consecutiveRight: number;
    wrongCount: number;
    nextReviewAt: Date;
}

export interface MemoryStateInput {
    stage?: string;
    memoryStrength?: number;
    stability?: number;
    repetitionCount?: number;
    consecutiveRight?: number;
    wrongCount?: number;
}

const DAY_MS = 24 * 3600 * 1000;
const MAX_STRENGTH = 10;
const MAX_STABILITY = 180; // ~6 months ceiling

/**
 * Compute the next memory state given the previous state and a test score.
 */
export function nextMemoryState(prev: MemoryStateInput | null, score: number): MemoryState {
    const strength = prev?.memoryStrength ?? 0;
    const stability = prev?.stability ?? 1;
    const repetitionCount = prev?.repetitionCount ?? 0;
    const consecutiveRight = prev?.consecutiveRight ?? 0;
    const wrongCount = prev?.wrongCount ?? 0;

    // ---- score = 2: correct -------------------------------------------------
    if (score >= 2) {
        const newConsecutive = consecutiveRight + 1;
        // Strength: +1 per hit, +1.5 bonus once the word is "warm" (3+ streak)
        const newStrength = Math.min(MAX_STRENGTH, strength + (newConsecutive >= 3 ? 1.5 : 1));
        // Stability: exponential growth, the SM-2 spirit
        const newStability = Math.min(MAX_STABILITY, stability * 1.6 + 0.4);
        return {
            stage: stageFor(newConsecutive),
            memoryStrength: round1(newStrength),
            stability: round1(newStability),
            repetitionCount: repetitionCount + 1,
            consecutiveRight: newConsecutive,
            wrongCount,
            // Review when stability has (statistically) decayed ~half
            nextReviewAt: new Date(Date.now() + newStability * DAY_MS),
        };
    }

    // ---- score = 1: shaky ("hard") -----------------------------------------
    if (score === 1) {
        const newConsecutive = consecutiveRight + 1;
        const newStrength = Math.min(MAX_STRENGTH, strength + 0.4);
        const newStability = Math.min(MAX_STABILITY, stability * 1.2);
        // Recognition without confidence never promotes past LEARNED
        const stage = newConsecutive >= 3 ? 'LEARNED' : 'FAMILIAR';
        return {
            stage,
            memoryStrength: round1(newStrength),
            stability: round1(newStability),
            repetitionCount: repetitionCount + 1,
            consecutiveRight: newConsecutive,
            wrongCount,
            // Shaky words come back tomorrow
            nextReviewAt: new Date(Date.now() + DAY_MS),
        };
    }

    // ---- score = 0: wrong ---------------------------------------------------
    const newWrong = wrongCount + 1;
    return {
        stage: 'UNFAMILIAR',
        memoryStrength: round1(Math.max(0, strength - 2)),
        stability: Math.max(1, round1(stability * 0.5)),
        repetitionCount: repetitionCount + 1,
        consecutiveRight: 0,
        wrongCount: newWrong,
        // Relearn queue: resurface in 10 minutes
        nextReviewAt: new Date(Date.now() + 10 * 60 * 1000),
    };
}

function stageFor(consecutiveRight: number): MemoryState['stage'] {
    if (consecutiveRight >= 6) return 'MASTERED';
    if (consecutiveRight >= 3) return 'LEARNED';
    if (consecutiveRight >= 1) return 'FAMILIAR';
    return 'UNFAMILIAR';
}

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}
