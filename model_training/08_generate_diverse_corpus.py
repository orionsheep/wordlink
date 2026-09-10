#!/usr/bin/env python3
"""
WordLink × ReadAge - 多样化语料生成器 (P0-2: Diverse Corpus Generator via LLM API)
==============================================================================
背景（P0-2 事故）：旧 01 合成器的 510 条 SFT 全部来自同一英文句子骨架换词，
rejected 全是同一句 "quintessential dichotomy..." 模板 → edge_sft 的 98.33%
只是模板记忆；旧 DPO 的偏好对也无信息量（P0-1 空转的共因）。

本脚本用真实 LLM API 生成多样化语料：
  chosen   = DeepSeek-V3 零样本生成（实测命中率 97.78% / JSON 100%），
             逐条过 validate_sample 硬过滤（hit==1.0 且 violation==0）
             + JSON 合法 + 长度带 + FKGL 难度带，不合格重试/丢弃；
  rejected = Qwen2.5-7B 零样本（temperature 0.9）在同题上的**真实失败输出**
             （命中不全 / 越界 / JSON 破碎才收，合格的丢弃不用）。

产物：
  data/wordlink_sft_train_v2.jsonl        （messages 格式 + metadata）
  data/wordlink_dpo_train_v2.jsonl        （TRL 字符串格式 prompt/chosen/rejected）
  data/bailian/bailian_sft_train_v2.jsonl （百炼上传格式）
  data/bailian/bailian_dpo_train_v2.jsonl （百炼偏好对格式）

特性：并发 worker、逐条落盘断点续跑、与基准测试集按 prompt 去重（测试集文件不动）。

用法：
  export LLM_BASE_URL=... SILICONFLOW_APIKEY=...
  python model_training/08_generate_diverse_corpus.py --target-sft 2200 --workers 6
"""

import os
import sys
import json
import time
import json
import hashlib
import argparse
import importlib.util
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

_here = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("prep", os.path.join(_here, "01_prepare_dataset.py"))
prep = importlib.util.module_from_spec(_spec)
sys.modules["prep"] = prep
_spec.loader.exec_module(prep)

_spec4 = importlib.util.spec_from_file_location("eval04", os.path.join(_here, "04_evaluate_benchmark.py"))
eval04 = importlib.util.module_from_spec(_spec4)
sys.modules["eval04"] = eval04
_spec4.loader.exec_module(eval04)

# ---------------------------------------------------------------- 语料规划 ---
TOPICS = [
    "Language exchange with a foreign friend in a cafe",
    "A visit to the UNESCO Historic Centre of Macau",
    "Using AI tools for sustainable environmental monitoring",
    "A student preparing for an international debate competition",
    "Developing healthy morning reading and reflection routines",
    "An innovative science project on ocean microplastics",
    "Cultural traditions and culinary delights of Macau",
    "Spaced repetition algorithms and memory consolidation",
    "A rainy weekend at a small bookshop",
    "Learning to cook a family recipe for the first time",
    "Cycling to school through the old town",
    "Volunteering at an animal shelter",
    "A football match that taught teamwork",
    "Photographing sunrise on a mountain trail",
    "Choosing a second-hand bicycle at the market",
    "A school exchange trip to a seaside town",
    "Helping grandparents video-call their relatives",
    "A job interview for a part-time library job",
    "Growing vegetables on a rooftop garden",
    "Taking the ferry between islands in fog",
    "A young musician's first street performance",
    "Fixing an old computer with a friend's help",
    "Designing a simple app for classroom quizzes",
    "Visiting a science museum's robot exhibition",
    "Training for a charity run in summer",
    "Recycling habits in a busy neighbourhood",
    "A documentary about polar wildlife",
    "Keeping a diary during exam season",
    "Navigating a new city with a paper map",
    "A night market food adventure",
    "Joining a community clean-up day",
    "Writing a short story for a school magazine",
    "A typewriter found in the attic",
    "Planning a budget-friendly study trip",
    "Learning sign language basics with classmates",
    "A chess club newcomer's first tournament",
    "Stormy weather and the lighthouse keeper",
    "Making friends at a summer language camp",
    "The bakery that opens before sunrise",
    "A museum night tour with a guide",
    "Choosing books for a village library",
    "An outdoor cinema evening by the river",
    "Building a birdhouse for the school garden",
    "A long train journey across the country",
]

# 每级目标词池（教学常用词 + 少量领域短语；短语用于锻炼短语命中判定）
TARGET_POOLS = {
    "A2": [
        "travel", "journey", "arrive", "weather", "forecast", "museum", "history", "culture",
        "explain", "decide", "prepare", "finish", "simple", "modern", "comfortable", "island",
        "bridge", "harbor", "nature", "quiet", "crowded", "explore", "discover", "enjoy",
        "local", "traditional", "festival", "celebrate", "remember", "forget", "practice",
        "improve", "express", "describe", "market", "delicious", "borrow", "invite",
    ],
    "B1": [
        "cognitive", "architecture", "adaptive", "interval", "algorithm", "simulate", "evaluate",
        "estimate", "predict", "efficient", "strategy", "foundation", "phenomenon", "perspective",
        "component", "challenge", "opportunity", "sustainable", "community", "collaborate",
        "innovate", "solution", "acquire", "reinforce", "retention", "fluency", "comprehension",
        "context", "relevant", "significant", "volunteer", "confident", "negotiate", "schedule",
    ],
    "B2": [
        "subconscious", "spontaneous", "neuroscience", "dynamic", "optimization", "equilibrium",
        "sophisticated", "hypothesis", "empirical", "methodology", "facilitate", "accelerate",
        "synthesize", "dilemma", "resilience", "pedagogical", "intrinsic", "extrinsic",
        "cognitive_load", "metacognition", "consolidation", "spaced_repetition", "attention_span",
    ],
}

FKGL_BAND = {"A2": (2.5, 7.5), "B1": (5.0, 10.5), "B2": (8.0, 13.5)}
WORDS_PER_PROMPT = 4


def http_chat(api_base, api_key, model, system, user, temperature, max_tokens=700, timeout=90):
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }).encode("utf-8")
    req = urllib.request.Request(
        api_base.rstrip("/") + "/chat/completions", data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
    )
    last_err = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            return body["choices"][0]["message"]["content"] or ""
        except Exception as e:
            last_err = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"API failed after retries: {last_err}")


def parse_story_json(raw: str):
    """容错解析模型输出的 JSON；返回 dict 或 None。"""
    text = raw.strip()
    if "</think>" in text:
        text = text.split("</think>")[-1].strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    try:
        obj = json.loads(text.strip())
        return obj if isinstance(obj, dict) else None
    except Exception:
        return None


def quality_gate(story: dict, targets, level):
    """chosen 硬过滤：JSON 键、命中 100%、越界 0、长度带、FKGL 难度带。"""
    for key in ("title", "content", "translation_zh", "target_words"):
        if key not in story:
            return False, f"missing key {key}"
    content = story.get("content", "")
    m = prep.validate_sample(content, targets, level)
    if m["hit_rate"] < 1.0:
        return False, f"hit {m['hit_rate']:.2f} miss={m['missing_words']}"
    if m["violation_rate"] > 0.0:
        return False, f"violation {m['out_of_vocab_words']}"
    wc = m["word_count"]
    if not (60 <= wc <= 200):
        return False, f"word_count {wc}"
    fkgl = eval04.calculate_flesch_kincaid(content)
    lo, hi = FKGL_BAND.get(level, (0, 20))
    if not (lo <= fkgl <= hi):
        return False, f"fkgl {fkgl} outside [{lo},{hi}]"
    return True, f"ok wc={wc} fkgl={fkgl}"


def build_task_list(target_sft: int, seed: int = 42):
    import random
    rnd = random.Random(seed)
    tasks, seen = [], set()
    levels = ["A2", "B1", "B2"]
    per_cell = max(1, -(-target_sft // (len(TOPICS) * len(levels))))
    for level in levels:
        for topic in TOPICS:
            for k in range(per_cell):
                targets = tuple(sorted(rnd.sample(TARGET_POOLS[level], WORDS_PER_PROMPT)))
                key = (level, topic, targets)
                if key in seen:
                    targets = tuple(sorted(rnd.sample(TARGET_POOLS[level], WORDS_PER_PROMPT)))
                    key = (level, topic, targets)
                seen.add(key)
                user = prep.USER_PROMPT_TEMPLATE.format(
                    cefr_level=level, topic=topic, target_words=", ".join(targets))
                tasks.append({"level": level, "topic": topic,
                              "targets": list(targets), "user": user})
    rnd.shuffle(tasks)
    return tasks[: int(target_sft * 1.35)]  # 预留过滤损耗余量


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target-sft", type=int, default=2200)
    ap.add_argument("--rejected-ratio", type=float, default=0.6)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--generator-model", default="deepseek-ai/DeepSeek-V3")
    ap.add_argument("--rejector-model", default="Qwen/Qwen2.5-7B-Instruct")
    ap.add_argument("--api-base", default=os.environ.get("LLM_BASE_URL", ""))
    ap.add_argument("--api-key", default=os.environ.get("SILICONFLOW_APIKEY", ""))
    ap.add_argument("--benchmark", default="data/wordlink_benchmark_test.jsonl")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--max-sft", type=int, default=0, help="调试：只生成前 N 条 (0=不限)")
    args = ap.parse_args()
    assert args.api_base and args.api_key, "需要 LLM_BASE_URL / SILICONFLOW_APIKEY"

    os.makedirs("data", exist_ok=True)
    os.makedirs("data/bailian", exist_ok=True)

    # 基准测试集 prompt 去重集合（测试文件保持不动）
    test_users = set()
    with open(args.benchmark, encoding="utf-8") as f:
        for line in f:
            test_users.add(json.loads(line)["messages"][1]["content"])
    print(f"测试集 prompt 数: {len(test_users)}（生成时自动避开）")

    sft_path = "data/wordlink_sft_train_v2.jsonl"
    dpo_path = "data/wordlink_dpo_train_v2.jsonl"
    done: set = set()
    if os.path.exists(sft_path):
        with open(sft_path, encoding="utf-8") as f:
            for line in f:
                try:
                    done.add(json.loads(line)["user_md5"])
                except Exception:
                    pass
        print(f"断点续跑：已有 {len(done)} 条 SFT，跳过")

    tasks = [t for t in build_task_list(args.target_sft, args.seed) if t["user"] not in test_users]
    if args.max_sft:
        tasks = tasks[: args.max_sft]
    todo = [t for t in tasks if hashlib.md5(t["user"].encode()).hexdigest() not in done]
    print(f"规划 {len(tasks)} 个生成任务，待生成 {len(todo)} 条（目标 ~{args.target_sft} 条入账）")

    counters = {"sft": 0, "dpo": 0, "rej_gen_fail": 0, "rej_too_good": 0, "drop": 0}
    lock = Lock()
    sft_f = open(sft_path, "a", encoding="utf-8")
    dpo_f = open(dpo_path, "a", encoding="utf-8")

    def worker(t):
        uid = hashlib.md5(t["user"].encode()).hexdigest()
        # ① chosen：DeepSeek-V3 温度 0.7 生成 → 硬过滤（最多重试 2 次）
        story = None
        reason = "unparseable"
        for _ in range(3):
            raw = http_chat(args.api_base, args.api_key, args.generator_model,
                            prep.SYSTEM_PROMPT, t["user"], temperature=0.7)
            obj = parse_story_json(raw)
            if obj is None:
                continue
            ok, why = quality_gate(obj, t["targets"], t["level"])
            if ok:
                story = obj
                break
            reason = why
        if story is None:
            with lock:
                counters["drop"] += 1
            return f"DROP({reason})"
        story["target_words"] = t["targets"]
        story["cefr_level"] = t["level"]
        chosen_str = json.dumps(story, ensure_ascii=False, indent=2)

        sft_entry = {
            "id": f"wordlink_sft_v2_{uid[:10]}",
            "user_md5": uid,
            "messages": [
                {"role": "system", "content": prep.SYSTEM_PROMPT},
                {"role": "user", "content": t["user"]},
                {"role": "assistant", "content": chosen_str},
            ],
            "metadata": {"cefr_level": t["level"], "target_words": t["targets"], "topic": t["topic"]},
        }

        # ② rejected：Qwen2.5-7B 零样本高温采样，只收「真实失败」输出
        dpo_entry = None
        if args.rejected_ratio > 0 and (counters["sft"] % max(1, int(1 / args.rejected_ratio)) == 0):
            try:
                rej_raw = http_chat(args.api_base, args.api_key, args.rejector_model,
                                    prep.SYSTEM_PROMPT, t["user"], temperature=0.9)
                rej_obj = parse_story_json(rej_raw)
                if rej_obj is None:
                    rej_content, rej_reason = rej_raw.strip(), "invalid json"
                else:
                    rej_content = rej_raw.strip()
                    ok, rej_reason = quality_gate(rej_obj, t["targets"], t["level"])
                if rej_obj is not None and ok:
                    with lock:
                        counters["rej_too_good"] += 1
                else:
                    # rejected 统一包装成 JSON 结构（保留 flaw 便于审计）
                    if rej_obj is None:
                        rej_obj = {"title": "(unparseable)", "cefr_level": t["level"],
                                   "target_words": t["targets"], "content": rej_content,
                                   "flaw": f"invalid json: {rej_reason}"}
                    else:
                        rej_obj["flaw"] = f"quality gate rejected: {rej_reason}"
                    rej_str = json.dumps(rej_obj, ensure_ascii=False, indent=2)
                    dpo_entry = {
                        "id": f"wordlink_dpo_v2_{uid[:10]}",
                        "prompt": [
                            {"role": "system", "content": prep.SYSTEM_PROMPT},
                            {"role": "user", "content": t["user"]},
                        ],
                        "chosen": [{"role": "assistant", "content": chosen_str}],
                        "rejected": [{"role": "assistant", "content": rej_str}],
                        "metadata": {"cefr_level": t["level"], "target_words": t["targets"]},
                    }
            except Exception as e:
                with lock:
                    counters["rej_gen_fail"] += 1
                return f"SFT ok / rej fail: {str(e)[:60]}"

        with lock:
            sft_f.write(json.dumps(sft_entry, ensure_ascii=False) + "\n")
            sft_f.flush()
            counters["sft"] += 1
            if dpo_entry:
                dpo_f.write(json.dumps(dpo_entry, ensure_ascii=False) + "\n")
                dpo_f.flush()
                counters["dpo"] += 1
        return "OK"

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(worker, t): t for t in todo}
        for i, fut in enumerate(as_completed(futures), 1):
            try:
                fut.result()
            except Exception as e:
                print(f"   ⚠️ task error: {str(e)[:80]}")
            if i % 25 == 0 or i == len(todo):
                print(f"   [{i}/{len(todo)}] sft={counters['sft']} dpo={counters['dpo']} "
                      f"drop={counters['drop']} rej_too_good={counters['rej_too_good']}")

    sft_f.close(); dpo_f.close()
    print(f"\n✅ 完成：SFT {counters['sft']} 条 → {sft_path}")
    print(f"✅ 完成：DPO {counters['dpo']} 对 → {dpo_path}")
    print(f"   丢弃 {counters['drop']} / rejected 太好被弃 {counters['rej_too_good']} / rejected 生成失败 {counters['rej_gen_fail']}")

    # ③ 百炼格式导出（消息格式，SFT 去掉 user_md5 辅助键）
    n_sft = n_dpo = 0
    with open(sft_path, encoding="utf-8") as fin, open("data/bailian/bailian_sft_train_v2.jsonl", "w", encoding="utf-8") as fout:
        for line in fin:
            r = json.loads(line)
            fout.write(json.dumps({"messages": r["messages"]}, ensure_ascii=False) + "\n")
            n_sft += 1
    with open(dpo_path, encoding="utf-8") as fin, open("data/bailian/bailian_dpo_train_v2.jsonl", "w", encoding="utf-8") as fout:
        for line in fin:
            r = json.loads(line)
            fout.write(json.dumps({"prompt": r["prompt"], "chosen": r["chosen"], "rejected": r["rejected"]}, ensure_ascii=False) + "\n")
            n_dpo += 1
    print(f"✅ 百炼格式：SFT {n_sft} → data/bailian/bailian_sft_train_v2.jsonl；DPO {n_dpo} → data/bailian/bailian_dpo_train_v2.jsonl")


if __name__ == "__main__":
    main()
