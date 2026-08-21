export type TelemetrySource = 'studio' | 'mobile' | 'immersive' | string;

export interface WordVisitTelemetry {
  word: string;
  dwellTimeMs: number;
  audioPlays: number;
  source: TelemetrySource;
}

const MIN_DWELL_MS = 300;
const MAX_DWELL_MS = 24 * 60 * 60 * 1000;
const MAX_AUDIO_PLAYS = 1000;
const MAX_WORD_LENGTH = 200;
const MAX_SOURCE_LENGTH = 64;

class TelemetryTracker {
  private currentWord: string | null = null;
  private enterTime = 0;
  private audioPlayCount = 0;
  private currentSource: TelemetrySource = 'studio';

  public trackEnter(word: string, source: TelemetrySource = 'studio'): void {
    const normalized = typeof word === 'string' ? word.trim().toLowerCase().slice(0, MAX_WORD_LENGTH) : '';
    if (!normalized) return;
    if (this.currentWord) this.flush();
    this.currentWord = normalized;
    this.enterTime = Date.now();
    this.audioPlayCount = 0;
    this.currentSource = typeof source === 'string' && source.trim() ? source.trim().slice(0, MAX_SOURCE_LENGTH) : 'studio';
  }

  public trackAudio(): void {
    if (!this.currentWord) return;
    this.audioPlayCount = Math.min(MAX_AUDIO_PLAYS, this.audioPlayCount + 1);
  }

  public flush(): void {
    if (!this.currentWord) return;

    const dwellTimeMs = Math.min(MAX_DWELL_MS, Math.max(0, Date.now() - this.enterTime));
    const payload: WordVisitTelemetry = {
      word: this.currentWord.slice(0, MAX_WORD_LENGTH),
      dwellTimeMs,
      audioPlays: Math.min(MAX_AUDIO_PLAYS, Math.max(0, Math.floor(this.audioPlayCount))),
      source: this.currentSource,
    };

    if (dwellTimeMs >= MIN_DWELL_MS && typeof window !== 'undefined') {
      const serialized = JSON.stringify(payload);
      let sent = false;
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          sent = navigator.sendBeacon('/api/user/visit', new Blob([serialized], { type: 'application/json' }));
        }
      } catch {
        sent = false;
      }
      if (!sent && typeof fetch === 'function') {
        try {
          fetch('/api/user/visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: serialized,
            credentials: 'include',
            keepalive: true,
          }).catch(() => undefined);
        } catch {
          // Navigation/transport failures are intentionally silent.
        }
      }
    }

    // Reset even when the request fails so a repeated pagehide/visibilitychange
    // cannot submit the same session twice.
    this.currentWord = null;
    this.enterTime = 0;
    this.audioPlayCount = 0;
    this.currentSource = 'studio';
  }
}

export const telemetry = new TelemetryTracker();

if (typeof window !== 'undefined') {
  const flush = () => telemetry.flush();
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') telemetry.flush();
  });
}
