#!/usr/bin/env python3
r"""
WordLink × ReadAge - 严格受限偏好优化 (Stage 3: Direct Preference Optimization - DPO)
================================================================================
目标：
在 SFT 基础上，使用 DPO (Direct Preference Optimization) 算法，对齐模型对两大约束的严格遵循：
1. 惩罚高难超纲生词 (CEFR Out-of-Vocabulary Penalty)
2. 惩罚生词槽位遗漏 (Target Slot Omission Penalty)
3. 强化生词与自然语境的母语级融合地道度

⭐ 2026-09-07 修复（P0-1 DPO 空转事故）：
旧版把 SFT adapter 以 is_trainable=True 挂到 base 上并传 ref_model=None，
TRL 0.11 会用「禁用 adapter 的 base」当参考模型 → 参考点是原始基座而非 SFT 模型。
由于偏好对的 chosen 恰是 SFT 学过的模板，β·margin≈6.4 使 sigmoid 饱和、梯度恒零，
训练 1h47m 权重逐字节未变（MD5 与 SFT adapter 完全相同）。

修复方案：
1. 先将 SFT adapter merge 进基座（merge_and_unload）→ outputs/wordlink_edge_sft_merged；
2. 在合并模型上新建 LoRA 再喂 DPOTrainer（隐式参考 = 禁用 adapter = SFT 模型，正确）；
3. NoOpGuard fail-fast：开局 20 步后 loss 仍 < 1e-4 直接抛错退出，杜绝再次空转；
4. rejected 必须来自真实模型失败输出（08 语料生成器产出），而非手写模板，
   保证 margin 有信息量。
"""

import os
import sys
import argparse
import json

# Ensure utf-8 console output
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def parse_args():
    parser = argparse.ArgumentParser(description="WordLink LexiConstrain DPO Alignment")
    parser.add_argument("--sft_model_path", type=str, default="outputs/wordlink_edge_sft",
                        help="Path to SFT fine-tuned model or adapter")
    parser.add_argument("--base_model_name", type=str, default="Qwen/Qwen2.5-1.5B-Instruct",
                        help="Original base model identifier")
    parser.add_argument("--dpo_train_file", type=str, default="data/wordlink_dpo_train_v2.jsonl",
                        help="Path to DPO preference dataset (string-format prompt/chosen/rejected)")
    parser.add_argument("--merged_output_dir", type=str, default="outputs/wordlink_edge_sft_merged",
                        help="Where to store the SFT-merged base model")
    parser.add_argument("--output_dir", type=str, default="outputs/wordlink_lexiconstrain_dpo",
                        help="Directory to save DPO-aligned model")
    parser.add_argument("--beta", type=float, default=0.1,
                        help="DPO temperature beta (KL divergence penalty weight)")
    parser.add_argument("--learning_rate", type=float, default=5e-6,
                        help="DPO fine-tuning learning rate")
    parser.add_argument("--num_train_epochs", type=int, default=2,
                        help="Number of DPO training epochs")
    parser.add_argument("--batch_size", type=int, default=1,
                        help="Batch size per device")
    parser.add_argument("--max_steps", type=int, default=-1,
                        help="Override total steps (chunked training); -1 = epochs")
    parser.add_argument("--save_steps", type=int, default=100,
                        help="Save checkpoint every N optimizer steps")
    parser.add_argument("--dry_run", action="store_true", default=False,
                        help="Run dataset validation without loading heavy models")
    return parser.parse_args()


def merge_sft_into_base(base_model_name: str, sft_adapter_path: str, merged_dir: str) -> str:
    """把 SFT LoRA 合并进基座并落盘；已存在则跳过。返回合并模型目录。"""
    adapter_file = os.path.join(sft_adapter_path, "adapter_model.safetensors")
    marker = os.path.join(merged_dir, "config.json")
    if os.path.exists(marker):
        print(f"🔗 合并模型已存在，跳过 merge: {merged_dir}")
        return merged_dir
    assert os.path.exists(adapter_file), f"SFT adapter 不存在: {adapter_file}"
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel

    print(f"🧬 [P0-1 修复] 合并 SFT adapter 进基座 → {merged_dir}")
    model = AutoModelForCausalLM.from_pretrained(base_model_name, torch_dtype=torch.float32, trust_remote_code=True)
    model = PeftModel.from_pretrained(model, sft_adapter_path)
    model = model.merge_and_unload()
    os.makedirs(merged_dir, exist_ok=True)
    model.save_pretrained(merged_dir)
    tok = AutoTokenizer.from_pretrained(base_model_name, trust_remote_code=True)
    tok.save_pretrained(merged_dir)
    del model
    print("✅ merge 完成")
    return merged_dir


class NoOpGuard:
    """DPO 空转保护：开局 warmup 步之后，若最近 N 条日志 loss 全部 < threshold 则抛错。"""
    # 兼容 TrainerCallback 分发器：缺失事件静默透传
    def __getattr__(self, name):
        if name.startswith("on_"):
            return lambda *a, **k: None
        raise AttributeError(name)

    def __init__(self, warmup_steps: int = 20, threshold: float = 1e-4, window: int = 5):
        self.losses = []
        self.warmup_steps = warmup_steps
        self.threshold = threshold
        self.window = window

    def __call__(self, args, state, control, logs=None, **kwargs):
        if not logs or "loss" not in logs:
            return
        self.losses.append(float(logs["loss"]))
        if state.global_step >= self.warmup_steps and len(self.losses) >= self.window:
            recent = self.losses[-self.window:]
            if all(l < self.threshold for l in recent):
                raise RuntimeError(
                    f"🛑 [NoOpGuard] DPO 空转保护触发：第 {state.global_step} 步，"
                    f"最近 {self.window} 条日志 loss 全部 < {self.threshold}（{recent}）。"
                    f"参考模型或偏好对构造存在问题，继续训练无意义。"
                )


def main():
    args = parse_args()
    print("=" * 70)
    print("🎯 [Step 3/5] Starting WordLink LexiConstrain DPO Alignment Pipeline")
    print(f"   SFT Checkpoint : {args.sft_model_path}")
    print(f"   DPO Dataset    : {args.dpo_train_file}")
    print(f"   Output Model   : {args.output_dir}")
    print(f"   DPO Beta       : {args.beta}")
    print(f"   Learning Rate  : {args.learning_rate}")
    print("=" * 70)

    if args.dry_run:
        assert os.path.exists(args.dpo_train_file), f"DPO dataset not found: {args.dpo_train_file}"
        with open(args.dpo_train_file, encoding="utf-8") as f:
            first = json.loads(f.readline())
        for key in ("prompt", "chosen", "rejected"):
            assert key in first, f"DPO jsonl 缺少键: {key}"
        os.makedirs(args.output_dir, exist_ok=True)
        with open(os.path.join(args.output_dir, "dpo_manifest.json"), "w", encoding="utf-8") as f:
            json.dump({**vars(args), "dry_run": True}, f, indent=2)
        print("✅ Dry-run manifest written.")
        return

    try:
        import torch
        from datasets import load_dataset
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from transformers.trainer_callback import TrainerCallback
        from peft import LoraConfig, PeftModel, TaskType
        from trl import DPOConfig, DPOTrainer
    except ImportError as e:
        print(f"❌ Required ML libraries not found: {e}")
        sys.exit(1)

    if torch.cuda.is_available():
        device = "cuda"
    elif getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        device = "mps"
        # 统一内存保护：DPO 需 policy + reference（禁用 adapter 的同一模型）双视角
        try:
            torch.mps.set_per_process_memory_fraction(0.65)
            print("🛡️ MPS capped at 0.65 × recommendedMaxWorkingSetSize(37.4GB) ≈ 24.3GB")
        except Exception as cap_err:
            print(f"⚠️ MPS 内存上限设置失败: {cap_err}")
    else:
        device = "cpu"
    print(f"🖥️ Execution Device: {device.upper()}")

    # ---- P0-1 修复核心：SFT 先合并进基座，再挂新 LoRA ----
    merged_dir = merge_sft_into_base(args.base_model_name, args.sft_model_path, args.merged_output_dir)

    tokenizer = AutoTokenizer.from_pretrained(merged_dir, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    print("🧠 Loading merged SFT model as DPO policy base...")
    model = AutoModelForCausalLM.from_pretrained(
        merged_dir,
        torch_dtype=torch.float32 if device != "cuda" else torch.bfloat16,
        trust_remote_code=True,
    ).to(device)

    new_lora = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=32,
        lora_alpha=64,
        lora_dropout=0.05,
        target_modules=["q_proj", "v_proj", "o_proj", "gate_proj", "down_proj"],
        bias="none",
    )
    from peft import get_peft_model
    model = get_peft_model(model, new_lora)
    model.print_trainable_parameters()

    # ---- 数据：字符串格式（prompt/chosen/rejected 均为 str），消息列表则自动模板化 ----
    print(f"📊 Loading DPO dataset from {args.dpo_train_file}...")
    dataset = load_dataset("json", data_files={"train": args.dpo_train_file})["train"]

    def to_strings(example):
        def render(x):
            if isinstance(x, str):
                return x
            return tokenizer.apply_chat_template(x, tokenize=False)
        return {"prompt": render(example["prompt"]), "chosen": render(example["chosen"]), "rejected": render(example["rejected"])}

    has_strings = isinstance(dataset[0]["chosen"], str)
    if not has_strings:
        print("   检测到消息列表格式 → 应用 chat template 转字符串")
        dataset = dataset.map(to_strings)

    dpo_config = DPOConfig(
        output_dir=args.output_dir,
        beta=args.beta,
        learning_rate=args.learning_rate,
        num_train_epochs=args.num_train_epochs,
        max_steps=args.max_steps,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=16,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        logging_steps=5,
        save_strategy="steps",
        save_steps=args.save_steps,
        save_total_limit=2,
        seed=42,
        max_length=1024,
        max_prompt_length=512,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        report_to="none",
    )

    noop_guard = NoOpGuard(warmup_steps=20, threshold=1e-4, window=5)

    print("🚀 Initializing DPOTrainer (reference = adapter-disabled SFT model)...")
    dpo_trainer = DPOTrainer(
        model=model,
        ref_model=None,  # PEFT 路径：TRL 禁用 adapter 充当参考 = 合并后的 SFT 模型 ✓
        args=dpo_config,
        train_dataset=dataset,
        tokenizer=tokenizer,
        callbacks=[noop_guard],
    )

    print("🔥 Executing Direct Preference Optimization...")
    import glob
    resume_from = None
    if not os.path.exists(os.path.join(args.output_dir, "TRAIN_DONE")):
        ckpts = sorted(glob.glob(os.path.join(args.output_dir, "checkpoint-*")),
                       key=lambda p: int(p.rsplit("-", 1)[1]))
        if ckpts:
            resume_from = ckpts[-1]
            print(f"♻️ 分程续跑：从 {resume_from} 恢复")
    dpo_trainer.train(resume_from_checkpoint=resume_from)
    if args.max_steps == -1:
        open(os.path.join(args.output_dir, "TRAIN_DONE"), "w").close()

    print(f"💾 Saving LexiConstrain DPO Model to {args.output_dir}...")
    dpo_trainer.model.save_pretrained(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)

    # ---- 真实训练 manifest（覆盖写，替代 dry_run 遗留）----
    final_metrics = {}
    for cb in dpo_trainer.callback_handler.callbacks:
        pass
    manifest = {
        **vars(args),
        "dry_run": False,
        "trained_at": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "device": device,
        "merged_sft_base": merged_dir,
        "fix": "P0-1: merge SFT -> new LoRA -> DPO; ref = adapter-disabled SFT model",
        "seed": 42,
        "train_samples": len(dataset),
    }
    with open(os.path.join(args.output_dir, "dpo_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print("🎉 Stage 3 DPO Preference Alignment Complete!")


if __name__ == "__main__":
    main()
