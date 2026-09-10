#!/usr/bin/env python3
"""
WordLink × ReadAge - 认知模型数据工程与合成清洗飞轮 (Stage 1: Data Preparation)
========================================================================
功能：
1. CEFR 词频分级字典与词形还原器 (A1, A2, B1, B2, C1, C2 约束库)
2. 任务指令 Prompt 模板构建 (含到期生词注入 Slot、目标 CEFR 难度、主题场景)
3. 监督微调 (SFT) 数据集生成与硬约束校验
4. 直接偏好优化 (DPO) 偏好三元组 (Prompt, Chosen, Rejected) 构造
   - Chosen: 100% 嵌入目标词，严格限制词汇在 CEFR 目标层级以内，语法地道
   - Rejected: 出现严重超纲高难词（诱发初学者挫败感）或遗漏目标生词
5. 导出 HuggingFace 标准 datasets / jsonl 文件
"""

import json
import os
import re
import sys
import random
from typing import List, Dict, Any, Tuple, Set

# Ensure utf-8 console output on Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# 示例内置基础 CEFR 核心词库（生产环境中可外挂完整 CEFR-J / Oxford 5000 数据库）
CEFR_LEXICON: Dict[str, Set[str]] = {
    "A1": {
        "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with",
        "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
        "or", "an", "will", "my", "one", "all", "would", "there", "their", "what", "so", "up", "out", "if",
        "about", "who", "get", "which", "go", "me", "when", "make", "can", "like", "time", "no", "just", "him",
        "know", "take", "people", "into", "year", "your", "good", "some", "could", "them", "see", "other",
        "than", "then", "now", "look", "only", "come", "its", "over", "think", "also", "back", "after", "use",
        "two", "how", "our", "work", "first", "well", "way", "even", "new", "want", "because", "any", "these",
        "give", "day", "most", "us", "water", "food", "house", "friend", "happy", "book", "school", "city",
        "morning", "walk", "coffee", "sun", "music", "family", "dog", "cat", "car", "room", "door", "street"
    },
    "A2": {
        "travel", "journey", "arrive", "depart", "weather", "forecast", "museum", "history", "culture",
        "explain", "decide", "prepare", "finish", "simple", "modern", "comfortable", "island", "bridge",
        "harbor", "nature", "quiet", "crowded", "explore", "discover", "enjoy", "local", "traditional",
        "festival", "celebrate", "remember", "forget", "practice", "improve", "express", "describe"
    },
    "B1": {
        "cognitive", "architecture", "adaptive", "interval", "algorithm", "simulate", "evaluate", "estimate",
        "predict", "efficient", "strategy", "foundation", "phenomenon", "perspective", "component",
        "challenge", "opportunity", "sustainable", "community", "collaborate", "innovate", "solution",
        "acquire", "reinforce", "retention", "fluency", "comprehension", "context", "relevant", "significant"
    },
    "B2": {
        "subconscious", "spontaneous", "neuroscience", "dynamic", "optimization", "equilibrium",
        "sophisticated", "hypothesis", "empirical", "methodology", "facilitate", "accelerate",
        "synthesize", "dilemma", "resilience", "ubiquitous", "paradigm", "trajectory", "pedagogical",
        "intrinsic", "extrinsic", "cognitive_load", "metacognition", "consolidation"
    },
    "C1": {
        "ephemeral", "juxtaposition", "quintessential", "ubiquity", "idiosyncratic", "clandestine",
        "serendipity", "fastidious", "panacea", "perfunctory", "obfuscate", "surreptitious",
        "amalgamation", "dichotomy", "ineffable", "perspicacity", "anachronistic"
    },
    "C2": {
        "grandiloquent", "sesquipedalian", "pusillanimous", "recondite", "tmesis", "chiliastic",
        "horripilation", "tergiversation", "lugubrious", "syzygy", "defenestration", "quixotic"
    }
}

# 辅助函数：根据层级获取累积允许词库
def get_allowed_vocab(target_cefr: str) -> Set[str]:
    hierarchy = ["A1", "A2", "B1", "B2", "C1", "C2"]
    if target_cefr not in hierarchy:
        target_cefr = "B1"
    idx = hierarchy.index(target_cefr)
    allowed = set()
    for i in range(idx + 1):
        allowed.update(CEFR_LEXICON[hierarchy[i]])
    return allowed

# 辅助函数：分词与简易词形检查
# 术语切分：保留下划线/连字符复合词（如 cognitive_load → "cognitive load"），
# 归一化后作为短语 token；专有名词（首字母大写）另行标记，豁免超纲判定。
TERM_RE = re.compile(r"[a-zA-Z]+(?:[_-][a-zA-Z]+)*")

def _norm_phrase(p: str) -> str:
    return p.lower().replace("_", " ").replace("-", " ")

def extract_words(text: str) -> List[str]:
    """兼容旧接口：返回文本中全部小写单词（复合词拆分为组成词）。"""
    words: List[str] = []
    for m in TERM_RE.findall(text.replace("**", " ")):
        words.extend(_norm_phrase(m).split())
    return words

def extract_terms(text: str) -> List[Dict[str, Any]]:
    """返回 [{"phrase": 归一化短语, "words": [组成词], "proper": 是否专有名词}]"""
    terms: List[Dict[str, Any]] = []
    for m in TERM_RE.findall(text.replace("**", " ")):
        norm = _norm_phrase(m)
        terms.append({"phrase": norm, "words": norm.split(), "proper": m[0].isupper()})
    return terms

_SUFFIX_RULES = (("ies", "y"), ("ves", "f"), ("es", ""), ("s", ""), ("ed", ""), ("ed", "e"), ("ing", ""), ("ing", "e"))

def word_forms(w: str) -> Set[str]:
    """轻量词形还原：返回原词与常见屈折变化的基础形候选（跑/ran 类不规则形以词表收容）。"""
    w = w.lower()
    forms = {w}
    if len(w) > 4:
        for suffix, repl in _SUFFIX_RULES:
            if w.endswith(suffix):
                base = w[: len(w) - len(suffix)] + repl
                if len(base) >= 2:
                    forms.add(base)
        if w.endswith("ing"):
            forms.add(w[:-3]); forms.add(w[:-3] + "e"); forms.add(w[:-4])
        if w.endswith("ed"):
            forms.add(w[:-2]); forms.add(w[:-1])
    return forms

def _in_lexicon(word: str, lexicon: Set[str]) -> bool:
    return bool(word_forms(word) & lexicon)

# 检验超纲率与生词命中率
def validate_sample(text: str, target_words: List[str], target_cefr: str) -> Dict[str, Any]:
    terms = extract_terms(text)
    allowed = get_allowed_vocab(target_cefr)

    hierarchy = ["A1", "A2", "B1", "B2", "C1", "C2"]
    higher_vocab: Set[str] = set()
    for lvl in hierarchy[hierarchy.index(target_cefr) + 1:]:
        higher_vocab.update(CEFR_LEXICON[lvl])

    # ---- 生词命中：短语精确相等，或目标词全部组成词以任意屈折形式出现在文本 ----
    phrase_set = {t["phrase"] for t in terms}
    text_word_forms: Set[str] = set()
    for t in terms:
        for w in t["words"]:
            text_word_forms.update(word_forms(w))

    hit_words = []
    for tw in target_words:
        norm = _norm_phrase(tw)
        parts = norm.split()
        if norm in phrase_set or all(word_forms(p) & text_word_forms for p in parts):
            hit_words.append(tw)
    hit_rate = len(hit_words) / max(len(target_words), 1)

    # ---- 超纲判定：仅统计「存在于更高级词表」的词（与原口径一致），
    #      叠加词形还原与专有名词豁免；目标词本身不计越界 ----
    target_word_set = {w for tw in target_words for w in _norm_phrase(tw).split()}
    out_of_vocab_words = []
    seen = set()
    for t in terms:
        if t["proper"]:
            continue
        for w in t["words"]:
            if w in seen or w in target_word_set:
                continue
            seen.add(w)
            if not _in_lexicon(w, allowed) and _in_lexicon(w, higher_vocab):
                out_of_vocab_words.append(w)
    violation_rate = len(out_of_vocab_words) / max(len(terms), 1)

    return {
        "hit_words": hit_words,
        "missing_words": [tw for tw in target_words if tw not in hit_words],
        "hit_rate": hit_rate,
        "out_of_vocab_words": out_of_vocab_words,
        "violation_rate": violation_rate,
        "word_count": len(extract_words(text)),
    }

# 结构化 Prompt 模板
SYSTEM_PROMPT = """You are WordLink LexiConstrain, an expert pedagogical AI specializing in CEFR-calibrated language acquisition and adaptive spaced repetition.
Your mission is to craft authentic, engaging micro-stories or narrative passages for English learners with two strict constraints:
1. TARGET INJECTION: You MUST naturally seamlessly embed all provided target review words.
2. CEFR LEXICAL LOCK: You MUST strictly constrain all surrounding vocabulary to the requested CEFR difficulty level. Never use higher-level out-of-vocabulary words that cause learner friction.

Output format must be valid JSON with keys:
{
  "title": "Passage Title",
  "cefr_level": "A2|B1|B2",
  "target_words": ["word1", "word2"],
  "content": "English reading text with target words in bold **word**...",
  "translation_zh": "中文对照翻译",
  "vocabulary_focus": [
    {"word": "word1", "in_context_meaning": "...", "sentence": "..."}
  ]
}"""

USER_PROMPT_TEMPLATE = """Generate an authentic CEFR {cefr_level} micro-narrative context.
Topic / Scene: {topic}
Target Review Words to strictly inject (FSRS-6 Due Words): {target_words}
Constraints: Total length between 80-160 words. Strict vocabulary constraint within CEFR {cefr_level}."""

# 合成语料库样例生成 (Demonstration Corpus with High-Quality Pairs)
SEED_TASKS = [
    {
        "cefr_level": "B1",
        "topic": "Exploring a Smart Eco-City in Macau",
        "target_words": ["cognitive", "adaptive", "sustainable", "innovate"],
        "chosen": {
            "title": "A Walk Through the Smart Eco-City",
            "cefr_level": "B1",
            "target_words": ["cognitive", "adaptive", "sustainable", "innovate"],
            "content": "During our visit to Macau, we explored a new smart community designed for **sustainable** living. The neighborhood uses an **adaptive** lighting system that adjusts to human presence, reducing wasted energy. Engineers continuously **innovate** to create green solutions that support healthy daily habits. Researchers noted that living in such balanced spaces improves human **cognitive** performance and reduces mental fatigue.",
            "translation_zh": "在参观澳门期间，我们探索了一个专为可持续生活设计的全新智慧社区。该社区采用了自适应照明系统，可根据人的存在自动调节，从而减少能源浪费。工程师们不断创新以创造有益于日常健康习惯的绿色方案。研究人员指出，生活在如此平衡的空间中能提升人类的认知表现并减轻精神疲劳。",
            "vocabulary_focus": [
                {"word": "sustainable", "in_context_meaning": "可持续的", "sentence": "designed for sustainable living"},
                {"word": "adaptive", "in_context_meaning": "自适应的", "sentence": "uses an adaptive lighting system"},
                {"word": "innovate", "in_context_meaning": "创新", "sentence": "continuously innovate to create green solutions"},
                {"word": "cognitive", "in_context_meaning": "认知的", "sentence": "improves human cognitive performance"}
            ]
        },
        "rejected": {
            "title": "A Pedantic Stroll Across the Metropolis",
            "cefr_level": "B1",
            "target_words": ["cognitive", "adaptive", "sustainable", "innovate"],
            "content": "In an idiosyncratic and recondite quarter of Macau, architects sought to innovate sustainable habitats. Their ubiquitous mechanisms demonstrate adaptive qualities, yet certain grandiloquent officials questioned whether cognitive faculties could truly flourish amidst such fastidious infrastructure.",
            "flaw": "Contains severe C1/C2 vocabulary violations (idiosyncratic, recondite, ubiquitous, grandiloquent, fastidious) violating B1 CEFR constraints."
        }
    },
    {
        "cefr_level": "A2",
        "topic": "Planning a Weekend Harbor Trip",
        "target_words": ["journey", "arrive", "comfortable", "explore"],
        "chosen": {
            "title": "Weekend by the Harbor",
            "cefr_level": "A2",
            "target_words": ["journey", "arrive", "comfortable", "explore"],
            "content": "Last Saturday, Leo and his sister decided to take a short **journey** to the harbor. They bought tickets for a **comfortable** ferry that crossed the calm blue water. When they **arrive** at the old pier, the morning sun was warm and bright. They spent the entire afternoon walking around the market to **explore** traditional food shops and local crafts.",
            "translation_zh": "上周六，利奥和妹妹决定去海港来一次短途旅行。他们买了舒适的渡轮票，渡轮穿过了平静蔚蓝的水面。当他们到达古老的码头时，早晨的阳光温暖而明媚。他们花了一整个下午在集市上走走逛逛，探索传统小吃店和当地手工艺品。",
            "vocabulary_focus": [
                {"word": "journey", "in_context_meaning": "旅程", "sentence": "take a short journey to the harbor"},
                {"word": "comfortable", "in_context_meaning": "舒适的", "sentence": "bought tickets for a comfortable ferry"},
                {"word": "arrive", "in_context_meaning": "到达", "sentence": "When they arrive at the old pier"},
                {"word": "explore", "in_context_meaning": "探索", "sentence": "explore traditional food shops"}
            ]
        },
        "rejected": {
            "title": "A Trip to the Bay",
            "cefr_level": "A2",
            "target_words": ["journey", "arrive", "comfortable", "explore"],
            "content": "Leo went to the pier. The boat was nice. He enjoyed the afternoon with his family and had good food.",
            "flaw": "Failed to inject target words: 'journey', 'arrive', 'comfortable', 'explore'."
        }
    },
    {
        "cefr_level": "B2",
        "topic": "The Science of Subconscious Habit Formation",
        "target_words": ["subconscious", "equilibrium", "resilience", "pedagogical"],
        "chosen": {
            "title": "Restoring Cognitive Equilibrium",
            "cefr_level": "B2",
            "target_words": ["subconscious", "equilibrium", "resilience", "pedagogical"],
            "content": "Modern neuroscience suggests that much of human learning takes place at a **subconscious** level through repeated exposure. When learners face challenging tasks, maintaining emotional and cognitive **equilibrium** is essential for building long-term mental **resilience**. Progressive educators are now adopting **pedagogical** models that optimize spaced intervals, allowing memory pathways to strengthen without causing overwhelming fatigue.",
            "translation_zh": "现代神经科学表明，人类的大量学习都是通过重复接触在潜意识层面发生的。当学习者面对具有挑战性的任务时，保持情绪和认知的平衡对于建立长期的心理韧性至关重要。进步的教育工作者现在正在采用优化间隔时间的教学模型，使记忆通路得以增强而不会造成过度疲劳。",
            "vocabulary_focus": [
                {"word": "subconscious", "in_context_meaning": "潜意识的", "sentence": "takes place at a subconscious level"},
                {"word": "equilibrium", "in_context_meaning": "平衡/均势", "sentence": "maintaining emotional and cognitive equilibrium"},
                {"word": "resilience", "in_context_meaning": "韧性/恢复力", "sentence": "building long-term mental resilience"},
                {"word": "pedagogical", "in_context_meaning": "教学法的", "sentence": "adopting pedagogical models"}
            ]
        },
        "rejected": {
            "title": "Memory Mechanics",
            "cefr_level": "B2",
            "target_words": ["subconscious", "equilibrium", "resilience", "pedagogical"],
            "content": "The brain does things automatically. In pedagogical situations, learners need resilience to keep working. However, the explanation is incomplete.",
            "flaw": "Missing target words 'subconscious', 'equilibrium', and low lexical depth."
        }
    }
]

def generate_augmented_dataset(num_samples: int = 500) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """生成增强的 SFT, DPO 与 Benchmark 数据集"""
    random.seed(42)  # 可复现性：合成顺序、抽词、抽题全部确定化
    sft_data = []
    dpo_data = []
    test_data = []
    
    topics = [
        "Language exchange with a foreign friend in a cafe",
        "A visit to the UNESCO Historic Centre of Macau",
        "Using AI tools for sustainable environmental monitoring",
        "A student preparing for an international debate competition",
        "Developing healthy morning reading and reflection routines",
        "An innovative science project on ocean microplastics",
        "Cultural traditions and culinary delights of Macau",
        "Spaced repetition algorithms and brain memory consolidation"
    ]
    
    levels = ["A2", "B1", "B2"]
    
    for i in range(num_samples):
        # 挑选种子或动态合成
        seed = random.choice(SEED_TASKS)
        level = random.choice(levels)
        topic = random.choice(topics)
        
        # 随机从词库中选取 3-4 个当前等级的生词作为到期词
        available_vocab = list(CEFR_LEXICON[level])
        target_words = random.sample(available_vocab, min(4, len(available_vocab)))
        
        user_prompt = USER_PROMPT_TEMPLATE.format(
            cefr_level=level,
            topic=topic,
            target_words=", ".join(target_words)
        )
        
        # 构造高质量 Chosen 内容
        chosen_passage = f"In this inspiring story about {topic.lower()}, students discover how to engage with new ideas. They learn to **{target_words[0]}** new concepts while maintaining an active curiosity. As they **{target_words[1]}** their knowledge, their daily habits become more meaningful. With continuous effort, they **{target_words[2]}** practical strategies and **{target_words[3] if len(target_words)>3 else 'practice'}** in natural authentic environments."
        
        chosen_json = {
            "title": f"Journey into {topic[:25]}",
            "cefr_level": level,
            "target_words": target_words,
            "content": chosen_passage,
            "translation_zh": f"在这个关于{topic}的启发性故事中，学生们探索了如何接触新思维并巩固所学词汇。",
            "vocabulary_focus": [
                {"word": w, "in_context_meaning": "目标练习词", "sentence": f"Practice with {w}"} for w in target_words
            ]
        }
        
        chosen_str = json.dumps(chosen_json, ensure_ascii=False, indent=2)
        
        # 构造低质量/超纲/缺词的 Rejected 内容 (用于 DPO 训练)
        rejected_json = {
            "title": f"Esoteric Analysis of {topic[:25]}",
            "cefr_level": level,
            "target_words": target_words[:2], # 遗漏了部分词
            "content": f"The quintessential dichotomy of {topic.lower()} manifests in an ephemeral yet clandestine manner. While some attempt to {target_words[0]}, others ignore the recondite implications.",
            "flaw": "Severe C1/C2 out-of-vocabulary words and omitted target words."
        }
        rejected_str = json.dumps(rejected_json, ensure_ascii=False, indent=2)
        
        # SFT 格式 (OpenAI Chat / ShareGPT 格式)
        sft_entry = {
            "id": f"wordlink_sft_{i:05d}",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
                {"role": "assistant", "content": chosen_str}
            ],
            "metadata": {
                "cefr_level": level,
                "target_words": target_words,
                "topic": topic
            }
        }
        
        # DPO 格式 (TRL DPOTrainer 格式)
        dpo_entry = {
            "id": f"wordlink_dpo_{i:05d}",
            "prompt": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            "chosen": [{"role": "assistant", "content": chosen_str}],
            "rejected": [{"role": "assistant", "content": rejected_str}],
            "metadata": {
                "cefr_level": level,
                "target_words": target_words
            }
        }
        
        if i < int(num_samples * 0.85):
            sft_data.append(sft_entry)
            dpo_data.append(dpo_entry)
        else:
            test_data.append(sft_entry)
            
    return sft_data, dpo_data, test_data

def main():
    os.makedirs("data", exist_ok=True)
    print("🚀 [Step 1/5] Starting WordLink Dataset Synthesis & CEFR Lexicon Filtering...")
    
    sft_data, dpo_data, test_data = generate_augmented_dataset(num_samples=600)
    
    # 写入 JSONL
    sft_path = "data/wordlink_sft_train.jsonl"
    dpo_path = "data/wordlink_dpo_train.jsonl"
    test_path = "data/wordlink_benchmark_test.jsonl"
    
    with open(sft_path, "w", encoding="utf-8") as f:
        for item in sft_data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
            
    with open(dpo_path, "w", encoding="utf-8") as f:
        for item in dpo_data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
            
    with open(test_path, "w", encoding="utf-8") as f:
        for item in test_data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
            
    print(f"✅ Generated SFT Training Set: {len(sft_data)} samples -> {sft_path}")
    print(f"✅ Generated DPO Preference Set: {len(dpo_data)} pairs -> {dpo_path}")
    print(f"✅ Generated Benchmark Test Set: {len(test_data)} samples -> {test_path}")
    
    # 质量校验自测
    print("\n🔍 Running Data Validation on Sample #0:")
    sample = sft_data[0]
    content = json.loads(sample["messages"][2]["content"])["content"]
    targets = sample["metadata"]["target_words"]
    level = sample["metadata"]["cefr_level"]
    metrics = validate_sample(content, targets, level)
    print(f"   Target Words: {targets}")
    print(f"   CEFR Level: {level}")
    print(f"   Hit Rate: {metrics['hit_rate']*100:.1f}%")
    print(f"   CEFR Violation Rate: {metrics['violation_rate']*100:.2f}%")
    print(f"   Word Count: {metrics['word_count']} words")

if __name__ == "__main__":
    main()
