#!/usr/bin/env python3
"""
WordLink × ReadAge - 阿里云百炼训练数据导出器 (Bailian Export Utility)
=====================================================================
把本管线的数据产物转换为阿里云百炼（DashScope 模型调优）可直接上传的格式：

1. SFT 数据  →  data/bailian/bailian_sft_train.jsonl   （ChatML messages 格式，百炼原生支持）
2. DPO 数据  →  data/bailian/bailian_dpo_train.jsonl   （百炼偏好训练格式：
                  {"prompt": [messages], "chosen": [assistant message], "rejected": [assistant message]}）

默认同时做「数据扩量」：调用 01_prepare_dataset 的确定性合成器把样本量从 ~510 扩到 ~1800+
（百炼微调建议样本量 ≥ 1000 效果更稳），并自动剔除与基准测试集重复的题目保证评测卫生。

用法：
  python model_training/07_export_bailian.py                # 扩量导出（推荐）
  python model_training/07_export_bailian.py --no-expand    # 只转换现有 510 条
"""

import os
import sys
import json
import argparse
import importlib.util

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


def clean_message(msg):
    """只保留百炼要求的 role/content 字段，剔除 metadata 等附加键。"""
    if isinstance(msg, dict) and "role" in msg and "content" in msg:
        return {"role": msg["role"], "content": msg["content"]}
    return msg


def export_sft(records, out_path):
    with open(out_path, "w", encoding="utf-8") as f:
        for r in records:
            item = {"messages": [clean_message(m) for m in r["messages"]]}
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(f"✅ SFT 导出: {out_path}（{len(records)} 条, ChatML 格式）")


def export_dpo(records, out_path):
    with open(out_path, "w", encoding="utf-8") as f:
        for r in records:
            item = {
                "prompt": [clean_message(m) for m in r["prompt"]],
                "chosen": [clean_message(m) for m in r["chosen"]],
                "rejected": [clean_message(m) for m in r["rejected"]],
            }
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(f"✅ DPO 导出: {out_path}（{len(records)} 条, 百炼偏好对格式）")


def main():
    parser = argparse.ArgumentParser(description="Export training data to Alibaba Cloud Bailian format")
    parser.add_argument("--no-expand", action="store_true", help="不扩量，只转换现有 data/ 下数据")
    parser.add_argument("--num-samples", type=int, default=2400, help="扩量时的生成样本上限")
    parser.add_argument("--out-dir", default="data/bailian")
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)

    # 基准测试集的 user 输入（用于剔除训练/测试重复）
    test_prompts = set()
    test_path = "data/wordlink_benchmark_test.jsonl"
    if os.path.exists(test_path):
        with open(test_path, encoding="utf-8") as f:
            for line in f:
                rec = json.loads(line)
                test_prompts.add(rec["messages"][1]["content"])
    print(f"基准测试集: {len(test_prompts)} 题（用于保证训练集不与评测集重复）")

    if args.no_expand:
        with open("data/wordlink_sft_train.jsonl", encoding="utf-8") as f:
            sft_records = [json.loads(l) for l in f]
        with open("data/wordlink_dpo_train.jsonl", encoding="utf-8") as f:
            dpo_records = [json.loads(l) for l in f]
        print("使用现有数据（不扩量）")
    elif os.path.exists("data/wordlink_sft_train_v2.jsonl"):
        # P0-2 修复后优先使用 API 多样化语料
        with open("data/wordlink_sft_train_v2.jsonl", encoding="utf-8") as f:
            sft_records = [json.loads(l) for l in f]
        dpo_records = []
        dpo_v2 = "data/wordlink_dpo_train_v2.jsonl"
        if os.path.exists(dpo_v2):
            with open(dpo_v2, encoding="utf-8") as f:
                dpo_records = [json.loads(l) for l in f]
        else:  # v2 SFT 存在但无 v2 偏好对 → 由 v2 SFT 构造（chosen vs 模板 rejected）
            for r in sft_records:
                dpo_records.append({
                    "id": r["id"] + "_dpo",
                    "prompt": r["messages"][:2],
                    "chosen": [r["messages"][2]],
                    "rejected": [{"role": "assistant", "content": json.dumps({
                        "title": "(template rejected)", "content": "",
                        "flaw": "legacy template — regenerate with 08 for real failures"})}],
                    "metadata": r["metadata"],
                })
        print(f"使用 v2 多样化语料: SFT {len(sft_records)} / DPO {len(dpo_records)}")
    else:
        print(f"调用确定性合成器扩量生成（目标 ≤{args.num_samples} 条）...")
        sft_records, dpo_records, _ = prep.generate_augmented_dataset(num_samples=args.num_samples)
        print(f"扩量完成: SFT {len(sft_records)} 条 / DPO {len(dpo_records)} 条")

    # 剔除与测试集重复的训练样本
    before = len(sft_records)
    sft_records = [r for r in sft_records if r["messages"][1]["content"] not in test_prompts]
    dpo_user = lambda r: next(m["content"] for m in r["prompt"] if m.get("role") == "user")
    dpo_records = [r for r in dpo_records if dpo_user(r) not in test_prompts]
    dropped = before - len(sft_records)
    if dropped:
        print(f"剔除与测试集重复样本: {dropped} 条")

    export_sft(sft_records, os.path.join(args.out_dir, "bailian_sft_train.jsonl"))
    export_dpo(dpo_records, os.path.join(args.out_dir, "bailian_dpo_train.jsonl"))

    print("\n📋 上传到百炼的操作路径：")
    print("   百炼控制台 → 模型调优 → 数据集管理 → 导入数据集（jsonl 直接上传）")
    print("   SFT 任务： 模型调优 → 训练新模型 → SFT → 基座选 Qwen2.5-7B-Instruct → 挂 bailian_sft_train.jsonl")
    print("   DPO 任务： 在 SFT 产出模型上 → 偏好训练 DPO → 挂 bailian_dpo_train.jsonl")
    print("   部署：     训练完成后 → 部署为专属服务 → 获得 endpoint → OpenAI 兼容调用")


if __name__ == "__main__":
    main()
