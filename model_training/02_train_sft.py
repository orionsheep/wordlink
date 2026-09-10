#!/usr/bin/env python3
"""
WordLink × ReadAge - 监督指令微调 (Stage 2: Supervised Fine-Tuning - SFT)
======================================================================
目标：
基于 Qwen2.5-1.5B-Instruct (或 7B-Instruct) 训练 WordLink-Edge / LexiConstrain 专有微调权重，
使其精准掌握：
1. 生词槽位注入 (Target Due Words Slot Embedding)
2. CEFR 分级词汇边界受限生成
3. 结构化 JSON 双语对齐输出

技术方案：
- 基座模型: Qwen/Qwen2.5-1.5B-Instruct (Edge SLM) / Qwen2.5-7B-Instruct
- 微调技术: LoRA (PEFT, r=64, alpha=128, all-linear projections)
- 训练框架: TRL SFTTrainer + Accelerate + HuggingFace Transformers
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
    parser = argparse.ArgumentParser(description="WordLink SFT Training Script")
    parser.add_argument("--model_name_or_path", type=str, default="Qwen/Qwen2.5-1.5B-Instruct",
                        help="Base model path or HuggingFace repo id")
    parser.add_argument("--train_file", type=str, default="data/wordlink_sft_train.jsonl",
                        help="Path to SFT training jsonl dataset")
    parser.add_argument("--output_dir", type=str, default="outputs/wordlink_edge_sft",
                        help="Directory to save fine-tuned checkpoints and LoRA adapter")
    parser.add_argument("--num_train_epochs", type=int, default=3,
                        help="Number of training epochs")
    parser.add_argument("--batch_size", type=int, default=4,
                        help="Per device batch size")
    parser.add_argument("--gradient_accumulation_steps", type=int, default=4,
                        help="Gradient accumulation steps")
    parser.add_argument("--learning_rate", type=float, default=2e-4,
                        help="Initial learning rate")
    parser.add_argument("--max_seq_length", type=int, default=1024,
                        help="Maximum sequence length")
    parser.add_argument("--lora_rank", type=int, default=64,
                        help="LoRA rank dimension")
    parser.add_argument("--lora_alpha", type=int, default=128,
                        help="LoRA alpha scaling factor")
    parser.add_argument("--use_qlora", action="store_true", default=False,
                        help="Use 4-bit NF4 QLoRA quantization to save VRAM")
    parser.add_argument("--bf16", action="store_true", default=False,
                        help="Use bfloat16 (supported on MPS in torch>=2.5; ~2x faster, smoke-test first)")
    parser.add_argument("--max_steps", type=int, default=-1,
                        help="Override total optimizer steps (chunked training); -1 = epochs")
    parser.add_argument("--save_steps", type=int, default=100,
                        help="Save checkpoint every N optimizer steps")
    parser.add_argument("--eval_ratio", type=float, default=0.0,
                        help="Validation split ratio for early stopping (0 disables; MPS 泄漏排查期间默认关闭)")
    parser.add_argument("--dry_run", action="store_true", default=False,
                        help="Validate pipeline configuration without heavy model loading")
    return parser.parse_args()

def main():
    args = parse_args()
    # P2.1: 模型已全部缓存于 HF cache，离线加载避免网络重试卡顿
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    print("=" * 70)
    print("🔥 [Step 2/5] Starting WordLink SFT (Supervised Fine-Tuning) Pipeline")
    print(f"   Base Model     : {args.model_name_or_path}")
    print(f"   Training File  : {args.train_file}")
    print(f"   Output Adapter : {args.output_dir}")
    print(f"   LoRA Config    : Rank={args.lora_rank}, Alpha={args.lora_alpha}")
    print(f"   Batch Size     : {args.batch_size} × {args.gradient_accumulation_steps} accum")
    print("=" * 70)

    if args.dry_run:
        print("⚡ Dry run mode enabled. Checking dataset structure...")
        assert os.path.exists(args.train_file), f"Dataset not found at {args.train_file}"
        with open(args.train_file, "r", encoding="utf-8") as f:
            first_line = json.loads(f.readline())
            assert "messages" in first_line, "JSONL must contain 'messages' key"
            print(f"✅ Dataset validation passed. Loaded sample with {len(first_line['messages'])} chat turns.")
        os.makedirs(args.output_dir, exist_ok=True)
        config_path = os.path.join(args.output_dir, "training_manifest.json")
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(vars(args), f, indent=2)
        print(f"✅ Dry-run manifest written to: {config_path}")
        return

    try:
        import torch
        from datasets import load_dataset
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            BitsAndBytesConfig,
            TrainingArguments
        )
        from peft import LoraConfig, get_peft_model, TaskType
        from trl import SFTTrainer
    except ImportError as e:
        print(f"❌ Required ML libraries not found: {e}")
        print("👉 Please install dependencies via: pip install -r model_training/requirements.txt")
        print("💡 You can run in verification mode with: python model_training/02_train_sft.py --dry_run")
        sys.exit(1)

    if torch.cuda.is_available():
        device = "cuda"
    elif getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        device = "mps"
        # 统一内存保护：限制本进程 Metal 内存池上限（超限抛 OOM 错误退出，而不是拖垮整机）。
        # 0.50 = 22.4GB/48GB；配合 MpsCacheSweeper 定期回收缓存，防 epoch 末长批峰值 OOM。
        try:
            torch.mps.set_per_process_memory_fraction(0.55)
            print("🛡️ MPS per-process memory fraction capped at 0.50")
        except Exception as cap_err:
            print(f"⚠️ MPS 内存上限设置失败（将继续无上限）: {cap_err}")
    else:
        device = "cpu"
    print(f"🖥️ Execution Device: {device.upper()}")
    if device == "cpu":
        print("⚠️ Warning: CUDA not detected. Training on CPU will be slow. Consider using a GPU server or Colab.")

    # 1. 加载 Tokenizer
    print("📦 Loading Tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(
        args.model_name_or_path,
        trust_remote_code=True,
        padding_side="right"
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 2. 量化配置 (若启用 QLoRA)
    bnb_config = None
    if args.use_qlora:
        print("🔒 Enabling 4-bit BitsAndBytes QLoRA quantization...")
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
            bnb_4bit_use_double_quant=True
        )

    # 3. 加载基座模型
    print("🧠 Loading Pretrained Base Model...")
    dtype = torch.bfloat16 if args.bf16 else torch.float32
    model = AutoModelForCausalLM.from_pretrained(
        args.model_name_or_path,
        quantization_config=bnb_config,
        device_map="auto" if device == "cuda" else None,
        torch_dtype=(torch.bfloat16 if (device == "cuda" and torch.cuda.is_bf16_supported()) else dtype),
        trust_remote_code=True
    )
    if device == "mps":
        model = model.to(device)

    # 4. LoRA 适配层配置
    peft_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=args.lora_rank,
        lora_alpha=args.lora_alpha,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        bias="none"
    )

    # 5. 加载数据（留出验证集用于早停，P2.5）
    print(f"📊 Loading dataset from {args.train_file}...")
    dataset = load_dataset("json", data_files={"train": args.train_file})["train"]
    if args.eval_ratio > 0 and len(dataset) >= 50:
        split = dataset.train_test_split(test_size=args.eval_ratio, seed=42)
        train_ds, eval_ds = split["train"], split["test"]
        print(f"   train={len(train_ds)} eval={len(eval_ds)} (早停启用)")
    else:
        train_ds, eval_ds = dataset, None

    # ⭐ P0 事故根治：固定长度预分词。变长 + batch1 导致 MPS 分配器每步拿到不同尺寸的
    # logits/CE 块（636~891 tok 连续分布），缓存零复用、池子只增不减 → 碎片化 OOM。
    # 统一 pad 到 max_seq_length 后每步张量形状完全一致，分配器块完美复用。
    def tokenize_fixed(ex):
        ids = tokenizer.apply_chat_template(ex["messages"], tokenize=True)
        ids = ids[: args.max_seq_length]
        pad = args.max_seq_length - len(ids)
        return {
            "input_ids": ids + [tokenizer.pad_token_id] * pad,
            "attention_mask": [1] * len(ids) + [0] * pad,
            "labels": ids + [-100] * pad,
        }

    n_train_before = len(train_ds)
    train_ds = train_ds.map(tokenize_fixed, remove_columns=train_ds.column_names, desc="tokenize(train)")
    if eval_ds is not None:
        eval_ds = eval_ds.map(tokenize_fixed, remove_columns=eval_ds.column_names, desc="tokenize(eval)")
    print(f"   固定长度 padding: {args.max_seq_length} tokens/样本（train {n_train_before}）")

    # 6. 训练超参数
    use_bf16_flag = args.bf16 or (device == "cuda" and torch.cuda.is_bf16_supported())
    common_kwargs = dict(
        output_dir=args.output_dir,
        num_train_epochs=args.num_train_epochs,
        max_steps=args.max_steps,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        learning_rate=args.learning_rate,
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        logging_steps=10,
        save_strategy="steps",
        save_steps=args.save_steps,
        save_total_limit=2,
        seed=42,
        group_by_length=False,  # P0 事故修复：分组把最长样本堆到 epoch 末，MPS 分配器碎片化 OOM；序列本就均匀(636~891 tok)，分组无收益
        eval_strategy="epoch" if eval_ds is not None else "no",
        bf16=use_bf16_flag,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        report_to="none",
    )
    if eval_ds is not None:
        common_kwargs.update(
            load_best_model_at_end=True,
            metric_for_best_model="eval_loss",
            greater_is_better=False,
        )
    training_args = TrainingArguments(**common_kwargs)

    # P0 复盘：MpsCacheSweeper/EarlyStopping 只在带 eval 的失败配置中出现过；
    # 分程续跑模式下完全对齐 v1 成功配置（无 eval、无回调），内存池每程全新。
    callbacks = [EarlyStoppingCallback(early_stopping_patience=2)] if eval_ds is not None else []

    # 7. SFTTrainer 启动训练
    print("🚀 Initializing SFTTrainer & Starting Fine-Tuning...")
    trainer_kwargs = dict(
        model=model,
        train_dataset=train_ds,
        peft_config=peft_config,
        tokenizer=tokenizer,
        args=training_args,
        max_seq_length=args.max_seq_length,
        callbacks=callbacks,
    )
    if eval_ds is not None:
        trainer_kwargs["eval_dataset"] = eval_ds
    trainer = SFTTrainer(**trainer_kwargs)

    # 分程续跑：checkpoint 存在且未打完成标记 → 从最后存档恢复
    import glob
    resume_from = None
    if not os.path.exists(os.path.join(args.output_dir, "TRAIN_DONE")):
        ckpts = sorted(glob.glob(os.path.join(args.output_dir, "checkpoint-*")),
                       key=lambda p: int(p.rsplit("-", 1)[1]))
        if ckpts:
            resume_from = ckpts[-1]
            print(f"♻️ 分程续跑：从 {resume_from} 恢复")

    trainer.train(resume_from_checkpoint=resume_from)

    if args.max_steps == -1:
        open(os.path.join(args.output_dir, "TRAIN_DONE"), "w").close()

    # 8. 保存 LoRA 权重与 Tokenizer
    print(f"💾 Saving SFT LoRA Adapter to {args.output_dir}...")
    trainer.model.save_pretrained(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    print("🎉 Stage 2 SFT Training Complete!")

if __name__ == "__main__":
    main()
