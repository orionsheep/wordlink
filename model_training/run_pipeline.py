#!/usr/bin/env python3
"""
WordLink × ReadAge - 端到端模型训练与评测总控脚本 (One-Click Master Pipeline)
========================================================================
执行流程：
1. Step 1: 语料合成与 CEFR 分级词典硬约束过滤 (01_prepare_dataset.py)
2. Step 2: 监督指令微调 SFT (02_train_sft.py)
3. Step 3: 严格受限直接偏好优化 DPO (03_train_dpo.py)
4. Step 4: 多模型基准对比自动化评测 (04_evaluate_benchmark.py)
5. Step 5: 4-bit 量化与 WebLLM 浏览器端权重生成 (05_export_webllm.py)
"""

import os
import sys
import subprocess
import argparse

# Ensure utf-8 console output
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def run_step(step_name: str, cmd: list):
    print("\n" + "=" * 80)
    print(f"▶️  EXECUTING: {step_name}")
    print(f"    Command: {' '.join(cmd)}")
    print("=" * 80)
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    res = subprocess.run(cmd, env=env)
    if res.returncode != 0:
        print(f"❌ Error occurred in {step_name} (Exit code: {res.returncode})")
        sys.exit(res.returncode)
    print(f"✅ COMPLETED: {step_name}")

def main():
    parser = argparse.ArgumentParser(description="WordLink Master Training Orchestrator")
    parser.add_argument("--dry_run", action="store_true", default=False,
                        help="Run pipeline in lightweight verification mode without GPU")
    parser.add_argument("--full_train", action="store_true", default=False,
                        help="Run full PyTorch/TRL training (requires CUDA GPU)")
    args = parser.parse_args()

    dry_flag = ["--dry_run"] if not args.full_train else []

    print("""
██╗    ██╗ ██████╗ ██████╗ ██████╗ ██╗     ██╗███╗   ██╗██╗  ██╗
██║    ██║██╔═══██╗██╔══██╗██╔══██╗██║     ██║████╗  ██║██║ ██╔╝
██║ █╗ ██║██║   ██║██████╔╝██║  ██║██║     ██║██╔██╗ ██║█████╔╝ 
██║███╗██║██║   ██║██╔══██╗██║  ██║██║     ██║██║╚██╗██║██╔═██╗ 
╚███╔███╔╝╚██████╔╝██║  ██║██████╔╝███████╗██║██║ ╚████║██║  ██╗
 ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝
   UNU Macau 2026 AI for SDGs · Neuro-Symbolic Cognitive Pipeline
    """)

    # Step 1: Data Preparation —— 优先用 08 的 API 多样化语料（P0-2 修复），
    # 无 API key 时退回 01 的确定性模板合成器（仅管线验证用，质量有限）
    if os.environ.get("LLM_BASE_URL") and os.environ.get("SILICONFLOW_APIKEY"):
        run_step("Step 1: Diverse Corpus Generation via LLM API (08)", [
            sys.executable, "model_training/08_generate_diverse_corpus.py",
            "--target-sft", "2200",
        ])
    else:
        print("⚠️ 未配置 LLM_BASE_URL/SILICONFLOW_APIKEY → 退回 01 模板合成器（数据多样性有限）")
        run_step("Step 1: Dataset Preparation & CEFR Filtering (legacy template)", [
            sys.executable, "model_training/01_prepare_dataset.py"
        ])

    # Step 2: Supervised Fine-Tuning（v2 多样化语料）
    run_step("Step 2: Supervised Fine-Tuning (SFT)", [
        sys.executable, "model_training/02_train_sft.py",
        "--train_file", "data/wordlink_sft_train_v2.jsonl",
    ] + dry_flag)

    # Step 3: DPO（v2 偏好对：真实模型失败输出；P0-1 修复后的 merge→新 LoRA 流程）
    run_step("Step 3: Direct Preference Optimization (DPO)", [
        sys.executable, "model_training/03_train_dpo.py",
        "--dpo_train_file", "data/wordlink_dpo_train_v2.jsonl",
    ] + dry_flag)

    # Step 4: Benchmark Evaluation
    run_step("Step 4: Automated Benchmark Evaluation", [
        sys.executable, "model_training/04_evaluate_benchmark.py"
    ])

    # Step 5: WebLLM Export & Quantization
    run_step("Step 5: WebLLM Edge Quantization & Packaging", [
        sys.executable, "model_training/05_export_webllm.py"
    ] + dry_flag)

    print("\n" + "=" * 80)
    print("🎉 ALL 5 TRAINING STAGES COMPLETED SUCCESSFULLY!")
    print("📂 Artifacts generated:")
    print("   • data/wordlink_sft_train_v2.jsonl        (SFT Diverse Corpus, API-generated)")
    print("   • data/wordlink_dpo_train_v2.jsonl        (DPO Preference Pairs, real failures)")
    print("   • data/wordlink_benchmark_test.jsonl      (Benchmark Test Set)")
    print("   • outputs/wordlink_edge_sft/              (SFT LoRA Adapter)")
    print("   • outputs/wordlink_edge_sft_merged/       (SFT-merged base, DPO start point)")
    print("   • outputs/wordlink_lexiconstrain_dpo/     (DPO Calibrated Model)")
    print("   • outputs/eval/*_metrics.json             (Real measured benchmark results)")
    print("   • outputs/wordlink_edge_webllm_q4f16/     (WebGPU Browser Package — requires MLC env)")
    print("   • model_training/06_webllm_engine.ts      (Frontend Next.js Client Engine)")
    print("=" * 80)

if __name__ == "__main__":
    main()
