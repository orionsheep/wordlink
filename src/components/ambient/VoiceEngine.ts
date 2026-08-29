/**
 * Ambient 屏保 TTS 语音引擎。
 *
 * - 英文词用英文音色，中文释义自动切换中文音色（浏览器按 lang 匹配）
 * - 通过 onDuckChange 回调通知声景引擎做 "说话时压低环境音" (ducking)
 */

type DuckCallback = (ducked: boolean) => void;

function isMostlyChinese(text: string): boolean {
    const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
    const latin = text.match(/[a-zA-Z]/g)?.length ?? 0;
    return cjk > 0 && cjk >= latin;
}

export class VoiceEngine {
    private enVoice: SpeechSynthesisVoice | null = null;
    private zhVoice: SpeechSynthesisVoice | null = null;
    private voicesReady = false;
    private enabled = true;

    /** 每次开始/结束朗读时触发（声景 ducking 用） */
    onDuckChange: DuckCallback | null = null;

    constructor() {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        const load = () => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length === 0) return;
            // 优先挑自然度高的英文音色
            this.enVoice =
                voices.find((v) => /^en/i.test(v.lang) && /Natural|Neural|Google|Samantha|Aria|Jenny/i.test(v.name)) ||
                voices.find((v) => /^en-US/i.test(v.lang)) ||
                voices.find((v) => /^en/i.test(v.lang)) ||
                null;
            this.zhVoice =
                voices.find((v) => /^zh(-|_)CN/i.test(v.lang) && /Natural|Neural|Xiaoxiao|Yunxi|Google/i.test(v.name)) ||
                voices.find((v) => /^zh/i.test(v.lang)) ||
                null;
            this.voicesReady = true;
        };
        load();
        window.speechSynthesis.onvoiceschanged = load;
    }

    setEnabled(on: boolean) {
        this.enabled = on;
        if (!on) this.stop();
    }

    isEnabled() {
        return this.enabled;
    }

    speak(text: string, rate = 0.92, onEnd?: () => void) {
        if (!this.enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
            onEnd?.();
            return;
        }
        if (!text.trim()) {
            onEnd?.();
            return;
        }
        const synth = window.speechSynthesis;
        if (!this.voicesReady) {
            const voices = synth.getVoices();
            if (voices.length > 0) {
                this.enVoice = voices.find((v) => /^en/i.test(v.lang)) ?? null;
                this.zhVoice = voices.find((v) => /^zh/i.test(v.lang)) ?? null;
            }
        }
        const chinese = isMostlyChinese(text);
        const utter = new SpeechSynthesisUtterance(text);
        const voice = chinese ? this.zhVoice : this.enVoice;
        if (voice) utter.voice = voice;
        utter.lang = chinese ? 'zh-CN' : 'en-US';
        utter.rate = rate;
        utter.pitch = 1;
        utter.volume = 1;
        utter.onstart = () => this.onDuckChange?.(true);
        utter.onend = () => {
            this.onDuckChange?.(false);
            onEnd?.();
        };
        utter.onerror = () => {
            this.onDuckChange?.(false);
            onEnd?.();
        };
        synth.speak(utter);
    }

    stop() {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            this.onDuckChange?.(false);
        }
    }

    destroy() {
        this.stop();
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.onvoiceschanged = null;
        }
    }
}
