/**
 * WordLink × ReadAge - 端侧极轻量 SLM 浏览器执行引擎 (Edge WebLLM Engine)
 * =========================================================================
 * 技术栈：
 * - WebGPU + @mlc-ai/web-llm
 * - 纯前端离线运行 (无需服务器，100% 隐私，零 API 成本)
 * - 契合 UNU Macau 2026 AI for SDGs (SDG 4 / LDC 弱网教育普及)
 */

import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";

export interface ContextualReadingResult {
  title: string;
  cefr_level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  target_words: string[];
  content: string;
  translation_zh: string;
  vocabulary_focus: Array<{
    word: string;
    in_context_meaning: string;
    sentence: string;
  }>;
}

export class WordLinkEdgeEngine {
  private static instance: WordLinkEdgeEngine;
  private engine: MLCEngine | null = null;
  private isInitializing: boolean = false;
  private modelId: string = "WordLink-Edge-1.5B-q4f16_1-MLC";
  private modelUrl: string = "https://huggingface.co/wordlink-ai/wordlink-edge-1.5b-q4f16-mlc/resolve/main/";

  private constructor() {}

  public static getInstance(): WordLinkEdgeEngine {
    if (!WordLinkEdgeEngine.instance) {
      WordLinkEdgeEngine.instance = new WordLinkEdgeEngine();
    }
    return WordLinkEdgeEngine.instance;
  }

  /**
   * 检查用户浏览器是否支持 WebGPU 硬件加速
   */
  public isWebGPUSupported(): boolean {
    return typeof navigator !== "undefined" && "gpu" in navigator;
  }

  /**
   * 初始化端侧模型（自动从 CDN/IndexedDB 缓存加载 ~950MB 权重）
   */
  public async init(onProgress?: (progress: number, text: string) => void): Promise<void> {
    if (this.engine) return;
    if (this.isInitializing) {
      throw new Error("WordLink-Edge engine is already initializing.");
    }

    if (!this.isWebGPUSupported()) {
      throw new Error("WebGPU is not supported on this browser. Falling back to server-side API.");
    }

    this.isInitializing = true;

    try {
      const initProgressCallback: InitProgressCallback = (report) => {
        if (onProgress) {
          onProgress(Math.round(report.progress * 100), report.text);
        }
      };

      this.engine = await CreateMLCEngine(this.modelId, {
        initProgressCallback,
        appConfig: {
          model_list: [
            {
              model_url: this.modelUrl,
              model_id: this.modelId,
              model_lib_url: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_48/qwen2-1.5b-instruct-q4f16_1-ctx2k-webgpu.wasm",
              low_resource_mode: true,
            },
          ],
        },
      });
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * 根据到期复习单词与目标 CEFR 等级现场生成自适应阅读短文
   */
  public async generateAdaptiveReading(params: {
    dueWords: string[];
    cefrLevel?: "A2" | "B1" | "B2";
    topic?: string;
    onToken?: (delta: string) => void;
  }): Promise<ContextualReadingResult> {
    const { dueWords, cefrLevel = "B1", topic = "Everyday life and discovery", onToken } = params;

    if (!this.engine) {
      throw new Error("Engine not initialized. Call init() first.");
    }

    const systemPrompt = `You are WordLink LexiConstrain, an expert pedagogical AI.
Output strictly valid JSON with keys: title, cefr_level, target_words, content, translation_zh, vocabulary_focus.
Embed ALL target words seamlessly while keeping non-target words within CEFR ${cefrLevel}.`;

    const userPrompt = `Generate a CEFR ${cefrLevel} reading text.
Scene: ${topic}
FSRS-6 Due Words to inject: ${dueWords.join(", ")}
Length: 90-150 words.`;

    const response = await this.engine.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 600,
      stream: true,
    });

    let fullText = "";
    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta?.content || "";
      fullText += delta;
      if (onToken) {
        onToken(delta);
      }
    }

    // JSON 提取与解析
    try {
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ContextualReadingResult;
      }
      throw new Error("No valid JSON found in response");
    } catch {
      // 容错降级结构
      return {
        title: `Adaptive Review: ${topic}`,
        cefr_level: cefrLevel,
        target_words: dueWords,
        content: fullText,
        translation_zh: "即时端侧生成的自适应复习语境。",
        vocabulary_focus: dueWords.map((w) => ({
          word: w,
          in_context_meaning: "Review Focus",
          sentence: `Practice sentence for ${w}`,
        })),
      };
    }
  }

  /**
   * 卸载模型释放 GPU 显存
   */
  public async dispose(): Promise<void> {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
    }
  }
}
