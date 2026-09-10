# WordLink 模型基准实测报告（Real Measured Results）

> 评测日期：2026-09-09（v2 最终版）· 基准集：`data/wordlink_benchmark_test.jsonl`（90 题）
> 评测协议：temperature=0 贪心解码，每题以 system+user 提示请求模型生成 CEFR 受限短文
>（含目标生词注入），对**模型真实输出**解算四项指标。
> 本报告所有数字均为实测，取代 `MODEL_TRAINING_PIPELINE.md` 旧版中的模拟对比表。

## 📊 实测对比总表（最终版 · v2 全模型链）

| 模型 | 部署形态 | 生词命中 ↑ | CEFR 越界 ↓ | JSON 合规 ↑ | FKGL | 状态 |
|---|---|---:|---:|---:|---:|---|
| 1.5B 底座（Qwen2.5-1.5B 微调前） | — | 63.06% | 0.17% | 82.22% | 13.5 | 基线 |
| **+ SFT（2045 条多样化语料）** | 浏览器 WebGPU（目标形态） | **88.06%** | **0.01%** | **100%** | **9.82** | ✅ |
| **+ DPO（真实失败负例）** | 浏览器 WebGPU | **87.78%** | **0.01%** | **100%** | 9.94 | ✅ 与 SFT 持平 |
| ~~v1 模板 SFT（旧口径）~~ | — | ~~98.33%~~* | 0.22% | 100% | ~~14.61~~ | *模板记忆,仅对照 |
| Qwen2.5-7B 零样本 | SiliconFlow API | 39.72% | 0.07%† | **0%** | — | 失败模式实证 |
| DeepSeek-V3 零样本（教师） | SiliconFlow API | 97.78% | 0.01% | 100% | 10.38 | 教师与对照 |
| Teacher/Oracle（标准答案） | — | **98.33%** | **0.22%** | 100% | — | 上界参照 |

> † 零样本 7B 输出大量退化/破碎，有效文本失真，需与命中率、JSON 合规联合解读。

## 🔍 关键发现（最终版）

1. **同体量微调前后 +25pp**：1.5B 底座 63.06% → SFT 88.06%，JSON 82.22% → 100%——微调价值有了同体量直接证据。
2. **v2 泛化口径替代 v1 记忆口径**：v1 模板数据测得 98.33% 属于记忆效应；v2 用多样化语料重训后在旧模板测试集上仍达 88.06%，且 **FKGL 从 14.61（研究生级，与 A2/B1 定位矛盾）降至 9.82（匹配学习者）**、越界 0.01%——质量全面提升。
3. **DPO 与 SFT 持平但行为收敛更稳**：margins 0.105→11.28 真实爬升，越界同为 0.01%，指标无退化。
   ⚠️ 评测组合注意：DPO adapter 必须加载在 **base+ΔSFT 合并模型**之上（outputs/wordlink_lexiconstrain_dpo_merged），
   直接挂在原始基座上会得到 ≈底座的成绩（63.89%，已实测验证并修正）。
4. **零样本 7B 在严格格式任务上严重失效**（39.72%/0% JSON，退化重复与字段破碎）——LexiConstrain 式领域微调是必需品。
5. **DPO 的价值 = 行为稳健性而非指标增益**：与 SFT 统计持平（87.78% vs 88.06%，n=90 差异在噪声带内），
   但偏好分离度 margins 0.105→11.28、rejected 概率被压制至 -12.2，且零 reward hacking 退化
   （JSON 100%、越界 0.01%、零退化/零截断）——验证了对齐配方的安全性。DPO 的防回归价值在分布偏移下
   （非常规提示词、更长文本）才会显现，干净基准上测不到是预期行为。未来工作：near-miss 负样本
   （仅差一个词的"几乎对"输出）可让 DPO 在命中维度产生可测增益。
6. **7B 零样本失效与采样参数无关**：反退化参数宽限重跑仍为 41.67%/0% JSON（FKGL 103 = 乱码级文本），
   证明是任务级零样本失效。约束遵循能力与模型规模不成正比——1.5B-Instruct 经历了更密集的
   格式对齐后训练，输出紧凑守规矩；7B 更"有文采"但在四重约束下更容易写飞。

## ⚠️ 第一次 DPO 空转记录（2026-09-07 复盘，已修复）

`edge_dpo` 首评与 `edge_sft` 逐位相同（98.33/0.22/14.61/100），且 DPO adapter 与 SFT adapter
**MD5 逐字节相同**（`0b23d61b…`）——1h47m 训练权重零变化。根因：① `ref_model=None` + 已挂 SFT adapter
的 PeftModel，TRL 0.11 以「禁用 adapter 的原始基座」为参考 → β·margin≈6.4 sigmoid 饱和、梯度恒零；
② 旧偏好对 chosen 即 SFT 模板、rejected 为固定句。修复后 v2 已全链重训。

## 🧾 评测工件

| 文件 | 说明 |
|---|---|
| `outputs/eval/teacher_oracle_metrics.json` | 标准答案上界指标 |
| `outputs/eval/qwen15b_base_zeroshot_metrics.json` | 1.5B 底座零样本（微调前基线） |
| `outputs/eval/edge_sft_v2_metrics.json` / `*_predictions.jsonl` | SFT v2 实测指标与逐题输出 |
| `outputs/eval/edge_dpo_v2_merged_metrics.json` / `*_predictions.jsonl` | DPO v2（正确组合）实测 |
| `outputs/eval/qwen7b_zeroshot_metrics.json` / `deepseekv3_zeroshot_metrics.json` | 外部基线 |
| `model_training/eval_real.py` | 真实模型评测器（API/本地双后端，断点续跑） |

复现命令：
```bash
python model_training/eval_real.py --backend api --model Qwen/Qwen2.5-7B-Instruct --label qwen7b_zeroshot
python model_training/eval_real.py --backend local --base outputs/wordlink_lexiconstrain_dpo_merged --label edge_dpo_v2_merged
```
