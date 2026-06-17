# 曲线模块重构 PRD — Kaffelogic Roast Advisor

> 版本: v1.1.0-refactor | 日期: 2026-06-18 | 状态: ✅ 已完成

---

## 1. 动机与目标

### 1.1 背景

在 v1.0.0.1 的生产部署审查中发现，曲线相关模块存在以下结构性问题：

| 问题 | 影响 |
|------|------|
| 曲线生成采用 Hermite 插值，非烘焙物理常用的 Bezier 平滑 | 生成的曲线在 CC/FC 附近过渡不够自然 |
| 评分系统仅做均匀采样对比，无相位感知 | 无法判断干燥/Maillard/发展三段的比例是否合理 |
| 雷达图硬编码 scale 范围 | Filter 和 Espresso 共用相同标准，评估不准 |
| `.kpro` 序列化不完整 | 缺少 Kaffelogic Studio 需要的 PID/Zone/预热字段 |
| 对 Bezier 锚点格式支持不足 | 无法解析和复用内部参考曲线资产 |

### 1.2 目标

1. 引入 Bezier 曲线引擎，提升曲线生成质量
2. 评分系统增加相位分析、ROR 稳定度、Orientation 感知
3. 雷达图支持 Filter/Espresso 差异化 scale
4. `.kpro` 序列化/反序列化支持 Bezier 锚点格式和 STD2 协议字段
5. 类型系统扩展以承载新数据结构

### 1.3 非目标

- 不修改 UI 组件（React/Ant Design）
- 不改变 API 路由接口
- 不引入 Svelte 依赖
- 不导入完整的大体积参考曲线表数据

---

## 2. 模块架构

### 2.1 重构前后对比

```
重构前:
  lib/
  ├── types.ts              # CurvePoint, KproProfile
  ├── kpro.ts               # parse/serialize (简化格式)
  ├── profile-generator.ts  # Hermite 插值生成
  ├── curve-scoring.ts      # 均匀采样对比评分
  ├── curve-radar.ts        # 硬编码 6 维雷达
  └── kaffelogic-official.ts # 纯文本知识库

重构后:
  lib/
  ├── types.ts              # +BezierAnchor, +ProfileOrientation
  ├── curve-bezier.ts       # ★新增: Bezier 引擎
  ├── kpro.ts               # 支持 Bezier 锚点读写 + STD2 字段
  ├── profile-generator.ts  # 5 锚点 Bezier 生成
  ├── curve-scoring.ts      # 相位分析 + ROR + Orientation
  ├── curve-radar.ts        # 7 维雷达 + Filter/Espresso 差异化
  └── kaffelogic-official.ts # 不变
```

### 2.2 依赖关系

```
                   types.ts
                       │
              ┌────────┼────────┐
              │        │        │
       curve-bezier.ts  │  kaffelogic-official.ts
              │         │
    ┌─────────┼─────────┼─────────┐
    │         │         │         │
profile-   curve-    curve-     kpro.ts
generator  scoring   radar
```

---

## 3. 新增模块: `lib/curve-bezier.ts`

### 3.1 职责

提供三次 Bezier 曲线的纯数学工具函数，是整个曲线系统的底层引擎。

### 3.2 导出的函数

| 函数 | 签名 | 用途 |
|------|------|------|
| `bezierPosition` | `(p0, t1, t2, p3, ratio) → number` | de Casteljau 三次 Bezier 求值 |
| `bezierDerivative` | `(p0, t1, t2, p3, ratio) → number` | 导数（用于 ROR 计算） |
| `bezierFindRatio` | `(p0, t1, t2, p3, targetT, maxIter=36) → number` | 二分搜索逆求 ratio（给定温度→时间） |
| `bezierAtTime` | `(anchors[], timeSeconds) → {temp, ror}` | 查找目标时刻所在的 Bezier 段，计算温度+ROR |
| `sampleBezierAnchors` | `(anchors[], stepSeconds=15) → {tempPoints[], rorPoints[]}` | 从锚点采样离散曲线点 |
| `interpolateCurve` | `(points[], time) → number` | 离散点的线性插值 |
| `crossingTime` | `(points[], targetTemp) → number\|null` | 曲线穿越目标温度的时间 |
| `buildPhaseMetrics` | `(points[], ccTime, fcTime) → PhaseMetric[]` | 计算干燥/Maillard/发展三段指标 |
| `estimateRor` | `(points[], time) → number` | ±15s 窗口 ROR 估算 |

### 3.3 算法关键点

- **C1 连续性**: 相邻 Bezier 段共享控制柄方向，保证曲线一阶导数连续
- **数值稳定**: `bezierFindRatio` 最大迭代 36 次，精度 1e-9
- **边界安全**: 所有时间/温度输入均做 clamp 处理

---

## 4. 重构模块: `lib/profile-generator.ts`

### 4.1 变更概述

| 维度 | 重构前 | 重构后 |
|------|--------|--------|
| 曲线算法 | Hermite 插值 | 5 锚点 Bezier 曲线 |
| 锚点数量 | 4 个节点 | 5 个 Bezier 锚点 (Start/Mid-CC/CC/FC/Drop) |
| 控制柄 | 自动推算 tangent | 每个锚点显式 leftCtrl + rightCtrl |
| 输出字段 | 仅曲线点 | + anchors, + dtr, + 预热点/Zone 标记 |
| 生成器标记 | `target-generator` | `bezier-generator` |
| `rawFields` | 基础字段 | + `generator_dtr`, + `generator_preheat_policy`, + `generator_fan_preview_required` |

### 4.2 5 锚点 Bezier 布局

```
时间轴:   0s ────── ccT*0.5 ────── ccT ────── fcT ────── dropT

锚点 0     ●────────────────────────────────────────────────→ Start (入豆点)
           │  rightCtrl: 陡升温方向 (18°C 增量)
           │
锚点 1          ●───────────────────────────────────────────→ Mid-CC
                │  leftCtrl: 从陡转平
                │  rightCtrl: 向 CC 温度收敛
                │
锚点 2               ●──────────────────────────────────────→ CC (颜色变化)
                      │  leftCtrl: 锁定 CC 位置
                      │  rightCtrl: 进入 Maillard 段 (+3°C)
                      │
锚点 3                    ●─────────────────────────────────→ FC (一爆)
                           │  leftCtrl: Maillard 末段减速
                           │  rightCtrl: 进入发展段 (+2°C)
                           │
锚点 4                         ●────────────────────────────→ Drop (结束)
                                │  leftCtrl: 发展末段平稳着陆 (-1.5°C)
```

### 4.3 关键改进

- **自然平滑**: Bezier 控制柄使各段过渡更符合烘焙热力学（温度上升先快后慢）
- **DTR 暴露**: `rawFields.generator_dtr` 输出发展比，便于后续分析
- **安全标记**: `generator_preheat_policy` 和 `generator_fan_preview_required` 提醒用户手动验证
- **向后兼容**: `roastCurvePoints` 仍输出离散点，现有 UI 组件不受影响

---

## 5. 重构模块: `lib/curve-scoring.ts`

### 5.1 变更概述

| 维度 | 重构前 | 重构后 |
|------|--------|--------|
| 比较方式 | 48 点均匀采样 ΔT | 48 点均匀采样 + 相位对比 + ROR 分析 |
| 评分维度 | 1 维 (温度偏差) | 3 维 (温度 60% + ROR 20% + 相位 20%) |
| 输出 | score, rating, metrics | + `phaseBreakdown`, + `orientation`, metrics 扩展 |
| Orientation | 无 | Filter/Espresso 独立理想区间 |
| 建议 | 通用评级文案 | Orientation 相关的具体调整建议 |

### 5.2 新增字段

```typescript
type CurveScoreResult = {
  score: number;                    // 0-100
  rating: "excellent" | "good" | "review" | "poor";
  orientation?: ProfileOrientation; // Filter | Espresso
  phaseBreakdown: {                 // ★新增
    dryingPct: number;              // 干燥段占百分比
    maillardPct: number;            // Maillard段占百分比
    developmentPct: number;         // 发展段占百分比
    dtr: number;                    // 发展时间比
  };
  metrics: {
    pointsCompared: number;
    avgAbsDeltaC: number;
    maxAbsDeltaC: number;
    endDeltaC: number;
    durationDeltaSeconds: number;
    rorStabilityScore: number;      // ★新增: ROR 稳定度 0-100
    phaseAlignmentScore: number;    // ★新增: 相位对齐度 0-100
  };
  notes: string[];
};
```

### 5.3 评分算法

```
总分 = 温度偏差分 × 0.6 + ROR 稳定度 × 0.2 + 相位对齐度 × 0.2

温度偏差分: max(0, min(100, 100 - ΔT_avg×2.2 - ΔT_max×0.55 - ΔEnd×0.8 - ΔDuration/18))
ROR 稳定度: max(0, min(100, 100 - sqrt(ROR方差)×4))
相位对齐度: DTR 在区间(35) + Drying 在区间(35) + Maillard 在区间(30) - |ΔPhase|×0.8
```

### 5.4 Orientation 理想区间

| 指标 | Filter | Espresso |
|------|--------|----------|
| 干燥段 | 41-50% | 37-45% |
| Maillard段 | 28-42% | 25-40% |
| 发展段(DTR) | 15-25% | 17-22% |

---

## 6. 重构模块: `lib/curve-radar.ts`

### 6.1 变更概述

| 维度 | 重构前 | 重构后 |
|------|--------|--------|
| 维度数 | 6 | 7 (+DTR) |
| Scale | 硬编码 | Filter/Espresso 差异化 |
| referenceZone | 无 | 每个指标带参考区间 `[min, max]` |
| ROR 计算 | `Math.abs(slope - avg)` | 30s 窗口滚动 ROR 方差 |

### 6.2 七维雷达指标

| 维度 | key | 中文标签 | Scale (Filter/Espresso) | 含义 |
|------|-----|----------|------------------------|------|
| 终点温度 | finish | 终点温度 | 200-226 / 200-224 | Drop 点温度 |
| 爬升稳定 | stability | 爬升稳定 | 通用 0.02-0.38 | ROR 波动程度 |
| 发展推力 | development | 发展推力 | 6-36°C | 末段 ΔT |
| 发展比 | dtr | 发展比 | 14-26 / 17-23% | DTR 百分比 |
| 风速强度 | fan | 风速强度 | 9500-17000 RPM | 平均 RPM |
| 时长结构 | duration | 时长结构 | 360-580 / 380-680s | 总时长 |
| 点位密度 | density | 点位密度 | 3-30 | 温度点+风扇点密度 |

### 6.3 referenceZone 用途

前端 `CurveRadarChart` 组件读取 `referenceZone` 绘制雷达图上的"理想区域"半透明带，让用户直观看到各维度是否在合理区间内。

---

## 7. 增强模块: `lib/kpro.ts`

### 7.1 `.kpro` 序列化增强

**重构前输出 (简化)**:
```
profile_short_name:xxx
profile_designer:xxx
recommended_level:2.5
roast_profile:0,25,60,105,...     ← 点对格式
fan_profile:0,14700,120,14000,...
```

**重构后输出 (STD2 兼容)**:
```
profile_short_name:xxx
profile_designer:xxx
emulation_mode:0.0
recommended_level:2.5000
expect_fc:207.0
expect_colrchange:155.0
roast_levels:214.9,216.5,218,...

preheat_power:1100.0              ← ★新增: 预热点功率
preheat_nominal_temperature:240.0  ← ★新增: 预热目标温度
preheat_mode:5.0                   ← ★新增: 预热模式

roast_required_power:1200.0        ← ★新增: 目标功率
roast_PID_Kp:0.7172               ← ★新增: PID 比例
roast_PID_Ki:0.0                  ← ★新增: PID 积分
roast_PID_Kd:3.55                 ← ★新增: PID 微分
roast_target_in_future:25.0        ← ★新增: 预测时间
roast_use_prediction_method:1.0    ← ★新增: 预测开关

cooldown_hi_speed:16500.0          ← ★新增: 冷却高速
cooldown_lo_speed:15500.0          ← ★新增: 冷却低速
cooldown_lo_temperature:100.0      ← ★新增: 冷却温度

roast_profile:0.0000,33.0000,...   ← ★增强: 自动选择 Bezier 锚点或点对格式
fan_profile:0.0000,14700.0000,...
```

### 7.2 Bezier 锚点格式

当 `profile.anchors` 存在且 ≥4 个时，`roast_profile` 自动使用 Bezier 格式：

```
每个锚点 6 个值: pos.t, pos.T, leftCtrl.t, leftCtrl.T, rightCtrl.t, rightCtrl.T

例如 5 锚点:
roast_profile:0.0000,33.0000,0,0,20.0000,51.0000,65.0000,...  (30 个值)
```

首锚点的 leftCtrl 为 (0,0)，末锚点的 rightCtrl 为 (0,0) — 符合 Kaffelogic Studio 规范。

### 7.3 `.kpro` 解析增强

`parseCurvePoints()` 自动检测格式：
- **≥24 个数字且长度为 6 的倍数** → Bezier 锚点路径（提取 position 作为曲线点）
- **否则** → 传统点对路径（向后兼容）

---

## 8. 增强模块: `lib/types.ts`

### 8.1 新增类型

```typescript
// 曲线 Orientation
type ProfileOrientation = "Filter" | "Espresso";

// Bezier 锚点 (3 个 {t,T} 对 = position + leftCtrl + rightCtrl)
type BezierAnchor = {
  position: CurvePoint;
  leftCtrl: CurvePoint;
  rightCtrl: CurvePoint;
};
```

### 8.2 扩展类型

`KproProfile` 新增可选字段:
```typescript
orientation?: ProfileOrientation | null;  // 冲煮取向
anchors?: BezierAnchor[];                 // Bezier 锚点
```

---

## 9. 用户使用影响分析

### 9.1 无破坏性变更

| 场景 | 影响 |
|------|------|
| 上传 `.kpro` 文件 | ✅ 向后兼容，自动识别格式 |
| 曲线编辑器保存 | ✅ 输出增强 .kpro（含 PID/Zone 默认值） |
| 使用 Kaffelogic Studio 打开导出文件 | ✅ 完整 STD2 协议，更多参数可用 |
| 曲线评分 | ✅ 评分维度更丰富，建议更具体 |
| 雷达图 | ✅ 7 维 + 参考区间，可根据 Orientation 切换 |
| 曲线生成器 | ✅ 使用 Bezier 平滑，输出更自然 |

### 9.2 新增能力

- **Bezier 编辑模式**: 未来可在曲线编辑器中支持 Bezier 控制柄拖拽（依赖 `lib/curve-bezier.ts` 引擎）
- **Bezier anchor 兼容**: 可以解析锚点格式 `.kpro` 文件
- **Orientation 推荐**: 评分系统可以告诉用户当前曲线更偏向 Filter 还是 Espresso

---

## 10. 质量保障

### 10.1 TypeScript 编译

```
npx tsc --noEmit
→ 零错误 ✅
```

### 10.2 Bezier 数学验证

- 5 锚点 Bezier 采样: 生成 28 个离散点，单调性保持 ✅
- CC 温度锚点: 在 131s 处温度 155.5°C (目标 155°C，误差 0.5°C) ✅
- Drop 温度: 216.1°C (目标 216.8°C，误差 0.7°C — 原因是最末段仅 1 个控制柄收束，后续可通过增加 post-drop 延续锚点改进) ⚠️

### 10.3 已知限制

| 限制 | 影响 | 后续方案 |
|------|------|----------|
| 无 post-drop 锚点 | Drop 温度偏差 ~0.7°C | 可添加 2 个延续锚点 |
| 无完整参考表导入 | 完整参考曲线表未入库 | 后续 Phase 2 导入 |
| PID/Zone 为默认值 | 需要用户手动调校 | 后续增加调校界面 |

---

## 11. 变更文件清单

| 文件 | 变更类型 | 行数变化 |
|------|----------|----------|
| `lib/curve-bezier.ts` | **新增** | +207 |
| `lib/types.ts` | 增强 | +8 |
| `lib/kpro.ts` | 重写核心函数 | +80 / -30 |
| `lib/profile-generator.ts` | 重写核心函数 | +50 / -40 |
| `lib/curve-scoring.ts` | 重写 | +120 / -60 |
| `lib/curve-radar.ts` | 重写 | +60 / -30 |
| `lib/roast-persistence.ts` | 修复 | +1 |

**净增代码**: ~350 行 | **函数变更**: 12 个新增 / 8 个重写 / 1 个修复

---

## 12. 后续迭代规划

```
Phase 2: 数据导入 (预计 4 小时)
├── 稀疏参考表提取为独立 JSON
├── public/curve-reference.json (压缩后 ~2MB gzip)
├── lib/reference-curves.ts: 查询接口 + LRU 缓存
└── 可选迁移: 稀疏子集入 Supabase

Phase 3: 编辑器增强 (预计 8 小时)
├── Bezier 控制柄可视化编辑
├── .kpro 导入 Bezier 锚点保留原始控制柄
├── PID/Zone 参数编辑面板
└── Bezier anchor 兼容导入

Phase 4: 评分升级 (预计 4 小时)
├── 参考曲线表作为评分基准线
├── Orientation 自动检测
└── 杯测反馈加权评分
```
