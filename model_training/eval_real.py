#!/usr/bin/env python3
"""
WordLink × ReadAge - 真实模型生成评测器 (Real-Model Benchmark Evaluator)
=====================================================================
与 04_evaluate_benchmark.py 的区别：04 只解算数据集自带的标准答案（Teacher/Oracle），
本脚本让【真实模型】逐题作答，再对模型输出解算同一套指标：
  1. Target Word Slot Hit Rate (%)   生词注入命中率
  2. CEFR Violation Rate (%)          超纲词越界率
  3. Flesch-Kincaid Grade Level       阅读难度
  4. JSON Schema Compliance (%)       结构化输出合法率

两种推理后端：
  --backend api    OpenAI 兼容云端 API（如 SiliconFlow 的 Qwen2.5-7B / DeepSeek）
  --backend local  本地 transformers（MPS/CPU），可挂 LoRA adapter 评测微调效果

用法示例：
  # 云端零样本基线（LexiConstrain 的基座 Qwen2.5-7B）
  python model_training/eval_real.py --backend api --model Qwen/Qwen2.5-7B-Instruct \
      --api-base $LLM_BASE_URL --api-key $SILICONFLOW_APIKEY

  # 本地微调后的 WordLink-Edge（1.5B + SFT LoRA）
  python model_training/eval_real.py --backend local --label edge_sft \
      --base Qwen/Qwen2.5-1.5B-Instruct --adapter outputs/wordlink_edge_sft
"""

import os
import sys
import json
import time
import argparse
import importlib.util

# Ensure utf-8 console output
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# 复用 04 的指标解算（validate_sample / calculate_flesch_kincaid）
_here = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("eval04", os.path.join(_here, "04_evaluate_benchmark.py"))
eval04 = importlib.util.module_from_spec(_spec)
sys.modules["eval04"] = eval04
_spec.loader.exec_module(eval04)


def load_benchmark(path: str):
    items = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            system = rec["messages"][0]["content"]
            user = rec["messages"][1]["content"]
            gold = rec["messages"][2]["content"]
            items.append({
                "system": system,
                "user": user,
                "gold": gold,
                "target_words": rec["metadata"]["target_words"],
                "cefr_level": rec["metadata"]["cefr_level"],
            })
    return items


def extract_content(raw: str) -> str:
    """模型输出容错提取：优先取 JSON 里的 content，失败则原样返回。"""
    text = raw.strip()
    # 去掉 <think>...</think> 等推理段
    if "</think>" in text:
        text = text.split("</think>")[-1].strip()
    # 剥离 markdown 代码围栏
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    try:
        parsed = json.loads(text.strip())
        if isinstance(parsed, dict) and "content" in parsed:
            return text.strip(), True
    except Exception:
        pass
    return text.strip(), False


def gen_api(items, model, api_base, api_key, limit, pred_path, max_tokens=700, freq_penalty=0.0):
    """逐题调用云端 API，每题立即落盘（断点续跑：跳过已完成的题）。"""
    import urllib.request
    done_ids = set()
    if os.path.exists(pred_path):
        with open(pred_path, encoding="utf-8") as f:
            for line in f:
                try:
                    done_ids.add(json.loads(line)["user_md5"])
                except Exception:
                    pass
        print(f"   断点续跑: 已有 {len(done_ids)} 题结果，跳过")
    import hashlib
    results = []
    with open(pred_path, "a", encoding="utf-8") as out_f:
        for i, it in enumerate(items[:limit]):
            uid = hashlib.md5(it["user"].encode("utf-8")).hexdigest()
            if uid in done_ids:
                continue
            payload = json.dumps({
                "model": model,
                "messages": [
                    {"role": "system", "content": it["system"]},
                    {"role": "user", "content": it["user"]},
                ],
                "temperature": 0.0,
                "max_tokens": max_tokens,
                "frequency_penalty": freq_penalty,
            }).encode("utf-8")
            req = urllib.request.Request(
                api_base.rstrip("/") + "/chat/completions",
                data=payload,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            )
            out = ""
            for attempt in range(2):
                try:
                    with urllib.request.urlopen(req, timeout=90) as resp:
                        body = json.loads(resp.read().decode("utf-8"))
                    out = body["choices"][0]["message"]["content"] or ""
                    break
                except Exception as e:
                    if attempt == 1:
                        out = ""
                        print(f"   ⚠️ 第 {i+1} 题两次重试失败: {str(e)[:80]}")
                    time.sleep(2)
            out_f.write(json.dumps({
                "user_md5": uid,
                "prediction": out, "gold": it["gold"],
                "target_words": it["target_words"], "cefr_level": it["cefr_level"],
            }, ensure_ascii=False) + "\n")
            out_f.flush()
            results.append({**it, "prediction": out})
            done = i + 1
            if done % 10 == 0 or done == min(len(items), limit):
                print(f"   ... {done}/{min(len(items), limit)} 题完成")
    return results


def gen_local(items, base, adapter, limit, pred_path):
    import hashlib
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    if device == "mps":
        try:
            torch.mps.set_per_process_memory_fraction(0.20)
            print("🛡️ 本地评测进程内存池上限 0.20")
        except Exception:
            pass
    print(f"   本地后端设备: {device} | base={base} | adapter={adapter or '无'}")
    done_ids = set()
    if os.path.exists(pred_path):
        with open(pred_path, encoding="utf-8") as f:
            for line in f:
                try:
                    done_ids.add(json.loads(line)["user_md5"])
                except Exception:
                    pass
        print(f"   断点续跑: 已有 {len(done_ids)} 题结果，跳过")
    tokenizer = AutoTokenizer.from_pretrained(base, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        base, torch_dtype=torch.float16 if device == "mps" else torch.float32,
        trust_remote_code=True,
    )
    if adapter:
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, adapter)
    model = model.to(device).eval()
    results = []
    with open(pred_path, "a", encoding="utf-8") as out_f:
        for i, it in enumerate(items[:limit]):
            uid = hashlib.md5(it["user"].encode("utf-8")).hexdigest()
            if uid in done_ids:
                continue
            messages = [
                {"role": "system", "content": it["system"]},
                {"role": "user", "content": it["user"]},
            ]
            prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            inputs = tokenizer(prompt, return_tensors="pt").to(device)
            with torch.no_grad():
                output = model.generate(
                    **inputs,
                    max_new_tokens=600,
                    do_sample=False,
                    temperature=None,
                    top_p=None,
                    top_k=None,
                    pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
                )
            gen = tokenizer.decode(output[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
            out_f.write(json.dumps({
                "user_md5": uid,
                "prediction": gen, "gold": it["gold"],
                "target_words": it["target_words"], "cefr_level": it["cefr_level"],
            }, ensure_ascii=False) + "\n")
            out_f.flush()
            results.append({**it, "prediction": gen})
            done = i + 1
            if done % 10 == 0 or done == min(len(items), limit):
                print(f"   ... {done}/{min(len(items), limit)} 题完成")
    del model
    return results


def score(results, label):
    hit, viol, fkgl, json_ok = [], [], [], 0
    for r in results:
        text, is_json = extract_content(r["prediction"])
        if is_json:
            json_ok += 1
            try:
                text = json.loads(text).get("content", text)
            except Exception:
                pass
        m = eval04.validate_sample(text, r["target_words"], r["cefr_level"])
        hit.append(m["hit_rate"])
        viol.append(m["violation_rate"])
        fkgl.append(eval04.calculate_flesch_kincaid(text))
    n = max(len(results), 1)
    return {
        "label": label,
        "samples": len(results),
        "hit_rate_pct": round(sum(hit) / n * 100, 2),
        "violation_rate_pct": round(sum(viol) / n * 100, 2),
        "avg_fkgl": round(sum(fkgl) / n, 2),
        "json_compliance_pct": round(json_ok / n * 100, 2),
    }


def main():
    p = argparse.ArgumentParser(description="WordLink Real-Model Benchmark Evaluator")
    p.add_argument("--benchmark", default="data/wordlink_benchmark_test.jsonl")
    p.add_argument("--backend", choices=["api", "local"], required=True)
    p.add_argument("--model", default=None, help="api 模型 id")
    p.add_argument("--api-base", default=os.environ.get("LLM_BASE_URL", ""))
    p.add_argument("--api-key", default=os.environ.get("SILICONFLOW_APIKEY", ""))
    p.add_argument("--base", default="Qwen/Qwen2.5-1.5B-Instruct", help="local 基座")
    p.add_argument("--adapter", default=None, help="local LoRA adapter 目录")
    p.add_argument("--label", default=None, help="结果标签（默认取模型名）")
    p.add_argument("--limit", type=int, default=90)
    p.add_argument("--max-tokens-api", type=int, default=700, dest="max_tokens_api")
    p.add_argument("--freq-penalty", type=float, default=0.0, dest="freq_penalty")
    p.add_argument("--out-dir", default="outputs/eval")
    args = p.parse_args()

    label = args.label or (args.model or (os.path.basename(args.adapter) if args.adapter else args.base))
    print(f"🔬 真实模型评测 | backend={args.backend} | label={label}")
    items = load_benchmark(args.benchmark)
    print(f"   基准集: {len(items)} 题, 本轮评测 {min(len(items), args.limit)} 题")

    os.makedirs(args.out_dir, exist_ok=True)
    pred_path = os.path.join(args.out_dir, f"{label}_predictions.jsonl")

    if args.backend == "api":
        assert args.model and args.api_base and args.api_key, "api 后端需要 --model 与 API 配置"
        gen_api(items, args.model, args.api_base, args.api_key, args.limit, pred_path)
    else:
        gen_local(items, args.base, args.adapter, args.limit, pred_path)

    # 两种后端统一：从落盘文件读取全部结果评分（天然支持断点续跑）
    with open(pred_path, encoding="utf-8") as f:
        results = [{
            "prediction": (r := json.loads(l))["prediction"],
            "target_words": r["target_words"],
            "cefr_level": r["cefr_level"],
        } for l in f]

    metrics = score(results, label)
    res_path = os.path.join(args.out_dir, f"{label}_metrics.json")
    with open(res_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)

    print("\n📊 实测结果:")
    print(f"   • 生词注入命中率   : {metrics['hit_rate_pct']}%")
    print(f"   • CEFR 超纲越界率  : {metrics['violation_rate_pct']}%")
    print(f"   • 平均 FKGL 年级   : {metrics['avg_fkgl']}")
    print(f"   • JSON 合规率      : {metrics['json_compliance_pct']}%")
    print(f"📂 预测明细: {pred_path}")
    print(f"📂 指标结果: {res_path}")


if __name__ == "__main__":
    main()
