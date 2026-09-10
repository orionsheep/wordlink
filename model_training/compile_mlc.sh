#!/bin/bash
# =========================================================================
# WordLink × ReadAge - MLC-LLM 4-bit Quantization Compilation Script
# =========================================================================
# Prerequisites:
#   pip install mlc-llm mlc-ai-nightly -f https://mlc.ai/wheels
# =========================================================================

set -e

MERGED_MODEL="outputs/wordlink_edge_merged_hf"
OUTPUT_DIR="outputs/wordlink_edge_webllm_q4f16"
QUANT="q4f16_1"

echo "🔨 Compiling HuggingFace weights to MLC-LLM W4A16 format..."
mlc_llm convert_weight ${MERGED_MODEL} \
    --quantization ${QUANT} \
    --output ${OUTPUT_DIR}

echo "📦 Generating WebLLM Wasm runtime artifacts..."
mlc_llm gen_config ${MERGED_MODEL} \
    --quantization ${QUANT} \
    --conv-template custom_wordlink \
    --context-window-size 2048 \
    --output ${OUTPUT_DIR}

echo "✨ Export completed successfully! Artifacts ready in ${OUTPUT_DIR}"
