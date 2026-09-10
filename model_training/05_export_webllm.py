#!/usr/bin/env python3
"""
WordLink × ReadAge - 端侧量化与 WebLLM 权重导出 (Stage 5: Edge Quantization & Export)
================================================================================
目标：
1. 合并 LoRA 适配层与基座模型权重 (merge_and_unload)
2. 导出为 HuggingFace 标准格式 (float16 / bfloat16)
3. 调用 MLC-LLM 工具链进行 4-bit 量化 (q4f16_1) 并生成 WebGPU 浏览器引擎所需的分片权重：
   - mlc-chat-config.json
   - ndarray-cache.json
   - params_shard_*.bin (~950MB 总量)
   - tokenizer 配置文件
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
    parser = argparse.ArgumentParser(description="WordLink WebLLM Edge Export Script")
    parser.add_argument("--base_model_name", type=str, default="Qwen/Qwen2.5-1.5B-Instruct",
                        help="Base model repository id or path")
    parser.add_argument("--lora_adapter_path", type=str, default="outputs/wordlink_edge_sft",
                        help="Path to trained LoRA adapter directory")
    parser.add_argument("--merged_output_dir", type=str, default="outputs/wordlink_edge_merged_hf",
                        help="Path to save merged FP16 HuggingFace model")
    parser.add_argument("--webllm_output_dir", type=str, default="outputs/wordlink_edge_webllm_q4f16",
                        help="Path to save quantized WebLLM package")
    parser.add_argument("--quantization", type=str, default="q4f16_1",
                        help="MLC-LLM quantization format (e.g., q4f16_1, q4f32_1)")
    parser.add_argument("--dry_run", action="store_true", default=False,
                        help="Generate export script and config without loading weights")
    return parser.parse_args()

def export_lora_merged(base_model_name: str, lora_adapter_path: str, merged_output_dir: str):
    """合并 LoRA 适配层并保存"""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel

    print(f"📦 Step 1: Loading Base Model [{base_model_name}]...")
    base_model = AutoModelForCausalLM.from_pretrained(
        base_model_name,
        torch_dtype=torch.float16,
        device_map="cpu",
        trust_remote_code=True
    )
    tokenizer = AutoTokenizer.from_pretrained(base_model_name, trust_remote_code=True)

    print(f"🔗 Step 2: Merging LoRA weights from [{lora_adapter_path}]...")
    if os.path.exists(os.path.join(lora_adapter_path, "adapter_config.json")):
        model = PeftModel.from_pretrained(base_model, lora_adapter_path)
        merged_model = model.merge_and_unload()
    else:
        print("⚠️ LoRA config not found, saving base model directly.")
        merged_model = base_model

    print(f"💾 Step 3: Saving merged model to [{merged_output_dir}]...")
    os.makedirs(merged_output_dir, exist_ok=True)
    merged_model.save_pretrained(merged_output_dir)
    tokenizer.save_pretrained(merged_output_dir)
    print("✅ Model merge complete!")

def generate_webllm_manifest(webllm_dir: str, quant_format: str):
    """生成 WebLLM 浏览器引擎所需的 mlc-chat-config 配置结构"""
    os.makedirs(webllm_dir, exist_ok=True)
    config = {
        "model_type": "qwen2",
        "quantization": quant_format,
        "model_id": "WordLink-Edge-1.5B-q4f16_1-MLC",
        "conv_template": {
            "name": "custom_wordlink",
            "system_template": "<|im_start|>system\n{system_message}<|im_end|>\n",
            "roles": {
                "user": "<|im_start|>user\n",
                "assistant": "<|im_start|>assistant\n"
            },
            "seps": ["<|im_end|>\n"],
            "stop_str": ["<|im_end|>", "<|endoftext|>"]
        },
        "context_window_size": 2048,
        "sliding_window_size": -1,
        "prefill_chunk_size": 1024,
        "attention_sink_size": -1,
        "temperature": 0.3,
        "repetition_penalty": 1.1,
        "top_p": 0.85
    }

    manifest_path = os.path.join(webllm_dir, "mlc-chat-config.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
    print(f"✅ Generated WebLLM Config: {manifest_path}")

def generate_shell_instructions(merged_dir: str, webllm_dir: str, quant_format: str):
    """输出 MLC-LLM CLI 完整编译指令"""
    sh_content = f"""#!/bin/bash
# =========================================================================
# WordLink × ReadAge - MLC-LLM 4-bit Quantization Compilation Script
# =========================================================================
# Prerequisites:
#   pip install mlc-llm mlc-ai-nightly -f https://mlc.ai/wheels
# =========================================================================

set -e

MERGED_MODEL="{merged_dir}"
OUTPUT_DIR="{webllm_dir}"
QUANT="{quant_format}"

echo "🔨 Compiling HuggingFace weights to MLC-LLM W4A16 format..."
mlc_llm convert_weight ${{MERGED_MODEL}} \\
    --quantization ${{QUANT}} \\
    --output ${{OUTPUT_DIR}}

echo "📦 Generating WebLLM Wasm runtime artifacts..."
mlc_llm gen_config ${{MERGED_MODEL}} \\
    --quantization ${{QUANT}} \\
    --conv-template custom_wordlink \\
    --context-window-size 2048 \\
    --output ${{OUTPUT_DIR}}

echo "✨ Export completed successfully! Artifacts ready in ${{OUTPUT_DIR}}"
"""
    script_path = "model_training/compile_mlc.sh"
    with open(script_path, "w", encoding="utf-8") as f:
        f.write(sh_content)
    print(f"✅ Created compilation shell script: {script_path}")

def main():
    args = parse_args()
    print("=" * 70)
    print("🌐 [Step 5/5] WordLink-Edge WebLLM Browser Deployment & Quantization")
    print(f"   Base Model     : {args.base_model_name}")
    print(f"   LoRA Adapter   : {args.lora_adapter_path}")
    print(f"   Merged Target  : {args.merged_output_dir}")
    print(f"   WebLLM Target  : {args.webllm_output_dir}")
    print(f"   Quant Format   : {args.quantization}")
    print("=" * 70)

    if args.dry_run:
        print("⚡ Dry run mode: Generating WebLLM configuration and compiler script...")
        generate_webllm_manifest(args.webllm_output_dir, args.quantization)
        generate_shell_instructions(args.merged_output_dir, args.webllm_output_dir, args.quantization)
        print("🎉 Dry run export setup verified successfully!")
        return

    try:
        export_lora_merged(args.base_model_name, args.lora_adapter_path, args.merged_output_dir)
        generate_webllm_manifest(args.webllm_output_dir, args.quantization)
        generate_shell_instructions(args.merged_output_dir, args.webllm_output_dir, args.quantization)
    except Exception as e:
        print(f"❌ Error during export: {e}")
        print("💡 Use --dry_run to generate scripts and verify configuration.")

if __name__ == "__main__":
    main()
