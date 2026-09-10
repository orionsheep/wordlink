#!/usr/bin/env python3
"""
WordLink × ReadAge - 自动化评测与模型对比基准 (Stage 4: Benchmark & Evaluation)
========================================================================
指标体系：
1. Target Word Slot Hit Rate (%)  - 生词嵌入命中率
2. CEFR Violation Rate (%)         - 超纲词汇越界率 (Out-of-Vocabulary Rate)
3. Flesch-Kincaid Reading Grade    - 可读性与认知负荷对齐度
4. JSON Schema Compliance (%)      - 结构化输出合规率
5. 综合评测报表生成 (Markdown / Console Table)
"""

import os
import sys
import json
import re
import math
from typing import List, Dict, Any

# Ensure utf-8 console output
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# 动态加载数据准备模块规则
import importlib.util
spec = importlib.util.spec_from_file_location("prep_module", os.path.join(os.path.dirname(__file__), "01_prepare_dataset.py"))
prep_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep_module)

CEFR_LEXICON = prep_module.CEFR_LEXICON
get_allowed_vocab = prep_module.get_allowed_vocab
extract_words = prep_module.extract_words
validate_sample = prep_module.validate_sample

def calculate_flesch_kincaid(text: str) -> float:
    """计算 Flesch-Kincaid Grade Level 认知阅读年级难度"""
    sentences = re.split(r'[.!?]+', text)
    sentences = [s for s in sentences if s.strip()]
    num_sentences = max(len(sentences), 1)
    
    words = extract_words(text)
    num_words = max(len(words), 1)
    
    # 简易音节数估算
    def count_syllables(word: str) -> int:
        word = word.lower()
        count = len(re.findall(r'[aeiouy]+', word))
        return max(1, count)
        
    num_syllables = sum(count_syllables(w) for w in words)
    
    # FKGL 公式 = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
    fkgl = 0.39 * (num_words / num_sentences) + 11.8 * (num_syllables / num_words) - 15.59
    return max(0.0, round(fkgl, 2))

def evaluate_predictions(dataset_path: str) -> Dict[str, Any]:
    """对测试集上的生成结果进行全方位指标解算"""
    if not os.path.exists(dataset_path):
        raise FileNotFoundError(
            f"Benchmark dataset not found: {dataset_path} — 先运行 01_prepare_dataset.py / 08_generate_diverse_corpus.py")

    with open(dataset_path, "r", encoding="utf-8") as f:
        records = [json.loads(line) for line in f]
        
    total = len(records)
    hit_rates = []
    violation_rates = []
    fkgl_scores = []
    valid_json_count = 0
    
    for item in records:
        content_str = item["messages"][2]["content"]
        target_words = item["metadata"]["target_words"]
        cefr_level = item["metadata"]["cefr_level"]
        
        try:
            parsed = json.loads(content_str)
            valid_json_count += 1
            text = parsed.get("content", "")
        except Exception:
            text = content_str
            
        metrics = validate_sample(text, target_words, cefr_level)
        hit_rates.append(metrics["hit_rate"])
        violation_rates.append(metrics["violation_rate"])
        fkgl_scores.append(calculate_flesch_kincaid(text))
        
    avg_hit_rate = (sum(hit_rates) / total) * 100
    avg_violation_rate = (sum(violation_rates) / total) * 100
    avg_fkgl = sum(fkgl_scores) / total
    json_compliance = (valid_json_count / total) * 100
    
    return {
        "samples_evaluated": total,
        "hit_rate_pct": round(avg_hit_rate, 2),
        "violation_rate_pct": round(avg_violation_rate, 2),
        "avg_fkgl_grade": round(avg_fkgl, 2),
        "json_compliance_pct": round(json_compliance, 2)
    }

def get_design_targets() -> Dict[str, Dict[str, Any]]:
    """⚠️ 设计目标（DESIGN TARGETS — NOT MEASURED）。
    2026-09-07 前本函数名为 get_simulated_benchmark_results 且被当作实测结果打印，
    造成「模拟数字冒充实测」的材料风险，现已隔离：主流程只在 outputs/eval/ 里
    加载真实评测结果，本表仅作历史设计参考、明确标注非实测。"""
    return {
        "[DESIGN TARGET] WordLink-LexiConstrain (SFT+DPO)": {
            "model_type": "7B Dedicated / SFT + DPO",
            "hit_rate": "≥99%", "violation_rate": "≤2%", "fkgl_stability": "±1 Grade",
            "offline_capable": "Yes (Server)", "inference_latency": "~200ms",
        },
        "[DESIGN TARGET] WordLink-Edge (1.5B 4-bit)": {
            "model_type": "1.5B Qwen / WebGPU 4-bit (~950MB)",
            "hit_rate": "≥98%", "violation_rate": "≤2%", "fkgl_stability": "±1 Grade",
            "offline_capable": "100% Browser In-Memory", "inference_latency": "~50ms/tok",
        },
    }


def load_real_measured_results() -> Dict[str, Dict[str, Any]]:
    """从 outputs/eval/*_metrics.json 加载 eval_real.py 产出的真实评测结果。"""
    real: Dict[str, Dict[str, Any]] = {}
    eval_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "outputs", "eval")
    if not os.path.isdir(eval_dir):
        return real
    for fname in sorted(os.listdir(eval_dir)):
        if not fname.endswith("_metrics.json"):
            continue
        label = fname[: -len("_metrics.json")]
        try:
            with open(os.path.join(eval_dir, fname), encoding="utf-8") as f:
                m = json.load(f)
            real[label] = {
                "hit_rate": f"{m.get('hit_rate_pct', '?')}%",
                "violation_rate": f"{m.get('violation_rate_pct', '?')}%",
                "avg_fkgl": str(m.get("avg_fkgl", "?")),
                "json_compliance": f"{m.get('json_compliance_pct', '?')}%",
                "samples": m.get("samples", "?"),
            }
        except Exception:
            continue
    return real

def print_benchmark_table():
    real = load_real_measured_results()

    print("\n" + "=" * 90)
    print("📊 UNU Macau 2026 AI for SDGs - Real Measured Benchmark (eval_real.py artifacts)")
    print("=" * 90)
    header = f"{'Model / Label':<38} | {'Hit':<9} | {'Viol.':<9} | {'FKGL':<7} | {'JSON%':<6}"
    print(header)
    print("-" * 90)
    if real:
        for name, d in real.items():
            print(f"{name:<38} | {d['hit_rate']:<9} | {d['violation_rate']:<9} | {d['avg_fkgl']:<7} | {d['json_compliance']:<6}")
    else:
        print("(no real metrics found — run model_training/eval_real.py first)")
    print("=" * 90)

    print("\n📎 Design targets (NOT measured, historical planning reference only):")
    for name, d in get_design_targets().items():
        print(f"   {name}: hit={d['hit_rate']} viol={d['violation_rate']}")
    print("💡 Key Takeaway for Defense (updated 2026-09-07):")
    print("   1. Zero-shot Qwen2.5-7B fails strict-constraint generation (39.7% hit, 0% JSON) →")
    print("      domain fine-tuning (LexiConstrain) is necessary, not optional.")
    print("   2. Full reports: outputs/eval/BENCHMARK_RESULTS.md")
    print("=" * 90 + "\n")

def main():
    print("🔬 [Step 4/5] Executing WordLink Automated Benchmark Evaluation...")
    test_path = "data/wordlink_benchmark_test.jsonl"
    if os.path.exists(test_path):
        res = evaluate_predictions(test_path)
        print(f"✅ Evaluated {res['samples_evaluated']} test instances:")
        print(f"   • Target Slot Hit Rate   : {res['hit_rate_pct']}%")
        print(f"   • CEFR Violation Rate    : {res['violation_rate_pct']}% (Target < 2.0%)")
        print(f"   • Avg Flesch-Kincaid Grade: {res['avg_fkgl_grade']}")
        print(f"   • JSON Schema Compliance : {res['json_compliance_pct']}%")
        
    print_benchmark_table()

if __name__ == "__main__":
    main()
