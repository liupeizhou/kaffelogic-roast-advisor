# Kaffelogic Roast Advisor — 项目全景分析

## 一、项目概要

这是一个基于 **Next.js 15** (App Router) 的 **咖啡烘焙曲线管理与智能分析平台**，面向 Kaffelogic Nano 烘焙机的用户。项目名称为 `kaffelogic-roast-advisor`，当前版本 0.1.0。

项目托管在 **Vercel** 上，数据层使用 **Supabase** (PostgreSQL + Storage + Auth)，前端 UI 基于 **Ant Design 6**，支持中英文双语。

## 二、技术栈

| 层级 | 技术选择 |
|------|----------|
| 框架 | Next.js 15 (App Router, React 19) |
| 语言 | TypeScript 5.7 |
| UI 库 | Ant Design 6.4 + Lucide React 图标 |
| 数据库 | Supabase (PostgreSQL, Row Level Security) |
| 文件存储 | Supabase Storage (私有 Bucket) |
| 认证 | Supabase Auth (邮箱 OTP 验证码登录) |
| AI 视觉 | OpenAI-compatible Vision API (默认 SiliconFlow / Qwen2.5-VL-72B) |
| 数据校验 | Zod |
| 测试 | Vitest 4 |
| 部署 | Vercel + 本地开发 |

## 三、项目文件结构

```
咖啡烘焙/
├── app/                          # Next.js App Router 页面与 API 路由
│   ├── [locale]/                 # 国际化路由 (/zh/*, /en/*)
│   │   ├── page.tsx              # 首页
│   │   ├── layout.tsx            # 本地化布局，包裹 AppShell
│   │   ├── login/page.tsx        # 邮箱验证码登录页
│   │   ├── account/page.tsx      # 账户与额度页
│   │   ├── recommend/page.tsx    # 烘焙曲线推荐页
│   │   ├── upload/page.tsx       # 上传分析页 (.kpro / log 图片)
│   │   ├── library/page.tsx      # 曲线/案例库页
│   │   ├── editor/
│   │   │   ├── page.tsx          # 曲线编辑器首页
│   │   │   └── [curveId]/page.tsx # 编辑特定曲线
│   │   ├── share/[slug]/page.tsx # 曲线分享页
│   │   └── admin/
│   │       ├── settings/page.tsx # 后台配置页
│   │       └── users/page.tsx    # 用户授权管理页
│   ├── api/                      # API 路由处理器
│   │   ├── account/quota/route.ts      # 额度查询
│   │   ├── admin/grants/route.ts       # 用户授权管理
│   │   ├── curves/route.ts             # 曲线 CRUD
│   │   ├── curves/[id]/route.ts        # 单条曲线操作
│   │   ├── curves/[id]/download/route.ts # 下载 .kpro
│   │   ├── import/reference-curves/route.ts # 批量导入参考曲线
│   │   ├── library/profiles/route.ts   # 曲线库列表
│   │   ├── settings/route.ts           # 运行时配置读写
│   │   ├── shares/route.ts             # 分享页创建
│   │   ├── share-image/[slug]/route.tsx # 分享长图生成
│   │   └── uploads/
│   │       ├── analyze/route.ts        # 上传分析主流程
│   │       └── confirm/route.ts        # 人工确认分析结果
│   ├── globals.css               # 全局样式
│   ├── layout.tsx                # 根布局
│   └── page.tsx                  # 根页面（重定向逻辑）
├── components/                   # React 组件
│   ├── app-shell.tsx             # 应用壳（侧边栏 + 顶栏 + 语言切换 + 认证状态）
│   ├── antd-providers.tsx        # Ant Design 主题/样式提供者
│   ├── home-page.tsx             # 首页内容
│   ├── email-otp-login.tsx       # 邮箱验证码登录表单
│   ├── account-dashboard.tsx     # 账户与额度面板
│   ├── upload-analyzer.tsx       # 上传分析交互
│   ├── library-dashboard.tsx     # 曲线/案例库面板
│   ├── curve-chart.tsx           # 曲线可视化图表
│   ├── curve-editor.tsx          # 曲线编辑器核心
│   ├── animated-roast-curve.tsx  # 烘焙曲线动画
│   ├── settings-panel.tsx        # 后台配置面板
│   ├── admin-user-grants.tsx     # 用户授权管理
│   ├── official-profile-guide.tsx # Kaffelogic 官方曲线指引
│   └── share-page.tsx            # 分享页渲染
├── lib/                          # 核心业务逻辑库
│   ├── types.ts                  # 全局类型定义
│   ├── kpro.ts                   # .kpro 文件解析/序列化
│   ├── kaffelogic-official.ts    # Kaffelogic 官方曲线知识库
│   ├── roast-persistence.ts      # 数据库 CRUD 封装（Supabase）
│   ├── uploads.ts                # 文件上传工具（哈希、分类、存储路径）
│   ├── openai-vision.ts          # AI 视觉分析（OpenAI-compatible Vision API）
│   ├── diagnostics.ts            # 分析结果归一化
│   ├── auth.ts                   # 用户认证（Supabase Auth 服务端）
│   ├── admin-auth.ts             # 管理员令牌验证
│   ├── runtime-config.ts         # 运行时配置读写（.env.local）
│   ├── quota.ts                  # 额度系统（三级套餐 + 按量计费）
│   ├── payments.ts               # 支付接口抽象（manual provider）
│   ├── i18n.ts                   # 国际化（中/英字典）
│   ├── share-copy.ts             # 分享页文案生成
│   ├── diagnostics.ts            # AI 分析结果标准化
│   └── supabase/
│       ├── client.ts             # 浏览器端 Supabase 客户端
│       ├── server.ts             # 服务端 Supabase 客户端
│       └── supabase-admin.ts     # Service Role 客户端
├── supabase/migrations/          # 数据库迁移脚本
│   ├── 20260614183000_kaffelogic_upload_analysis.sql  # v1 基础表结构
│   └── 20260615010000_saas_auth_quota_editor_share.sql # SaaS 认证/额度/编辑器/分享
├── __tests__/                    # 单元测试
│   ├── kpro.test.ts              # .kpro 解析测试
│   ├── kaffelogic-official.test.ts
│   ├── quota.test.ts
│   └── uploads.test.ts
├── middleware.ts                 # Next.js 中间件（语言检测 + 认证保护）
├── next.config.mjs               # Next.js 配置
├── vitest.config.ts              # 测试配置
├── eslint.config.mjs             # ESLint 配置
├── tsconfig.json                 # TypeScript 配置
├── package.json                  # 项目依赖与脚本
├── README.md                     # 项目文档
└── ops/sessions/                 # 操作会话日志（JSON）
```

## 四、核心功能模块

### 4.1 .kpro 文件解析 (lib/kpro.ts)

Kaffelogic `.kpro` 文件是一种基于 `key:value` 行的文本格式。解析模块实现了：

- **字段解析**：profile_short_name、designer、description、recommended_level、expect_fc（预期一爆温度）、expect_colrchange（预期颜色变化温度）、roast_levels（烘焙度档位数组）
- **曲线点解析**：从数值对中智能提取温度曲线 (roast_profile) 和风速曲线 (fan_profile) 的时间-数值点
- **序列化**：支持编辑后的曲线重新序列化为 .kpro 格式，保留原始字段
- **标签推断**：从文件名和描述中自动推断冲煮目标 (espresso/filter/cupping)、处理法 (washed/natural/honey/decaf/robusta)、海拔范围、来源类型

### 4.2 AI 视觉分析 (lib/openai-vision.ts)

上传的 Kaffelogic Nano log 截图通过 OpenAI-compatible Vision API 进行智能分析：

- 默认使用 SiliconFlow 的 Qwen2.5-VL-72B-Instruct 视觉模型
- 分析内容包括：一爆时间/温度、烘焙结束点、发展时间/比例、ROR（升温速率）行为、风险提示、下一锅调整建议
- 结果通过 `diagnostics.ts` 进行归一化和置信度校验
- 低置信度结果标记 `needsReview: true`，进入人工确认流程

### 4.3 额度系统 (lib/quota.ts)

三级套餐 + 按量计费的完整 SaaS 计费模型：

| 套餐 | 日限额 | 月限额 | 价格 |
|------|--------|--------|------|
| Free | 3 | 90 | ¥0 |
| Balanced | 10 | 300 | ¥39.9 |
| Pro | 100 | 3000 | ¥199 |

- 扣费优先级：订阅额度 → 按量余额 → 免费额度
- 每日/每月使用量按上海时区 (GMT+8) 统计
- 支付层抽象为 `PaymentProvider` 接口，当前使用 `manualPaymentProvider` 实现

### 4.4 曲线编辑器 (lib/roast-persistence.ts)

用户可创建/编辑/保存个人曲线文档（`curve_documents` 表）：

- 支持从 .kpro 导入或从零创建
- 自动版本管理（`curve_versions` 表），每次保存自动递增版本号
- 可见性控制：private（私有）/ public（公开）/ unlisted（不公开但可链接访问）

### 4.5 分享系统 (lib/roast-persistence.ts)

- 生成公开分享页（`share_pages` 表），带唯一 slug
- 支持三种模板风格：barista（咖啡师）/ baroque（巴洛克）/ cyberpunk（赛博朋克）
- 分享页包含曲线信息、AI 风味预测、引文等
- API 端点 `/api/share-image/[slug]` 可生成分享长图

### 4.6 官方知识库 (lib/kaffelogic-official.ts)

内置 Kaffelogic 官方曲线家族知识库，包含 8 个曲线家族：

- **KL Classic**：默认排障与中深烘起点
- **KL Explorer**：探索型对比曲线
- **Washed / Natural**：按处理法聚焦
- **RTD**：即烘即饮曲线
- **REST**：养豆后风味最优
- **Cupping**：杯测专用
- **Decaf**：低因咖啡
- **Robusta**：罗布斯塔专用
- **Super Dark**：极深烘

每个家族包含中英文使用意图、最佳场景、注意事项和关键词匹配规则。支持基于曲线数据自动计算干燥段、Maillard 段、发展段的时长和比例。

### 4.7 认证与授权

- **Supabase Auth**：邮箱 OTP 验证码登录（密码免密）
- **中间件保护**：`/upload`、`/editor`、`/account` 等路径需要登录，未认证用户重定向到登录页
- **管理员保护**：写操作通过 `x-admin-token` 请求头或 Bearer Token 进行管理员验证
- **Row Level Security**：所有用户数据表启用 RLS，用户只能查看自己的数据（或公开/未列出数据）

### 4.8 国际化 (lib/i18n.ts)

- 双语言支持：中文 (zh) / 英文 (en)，默认中文
- 基于 URL 路径的路由方案：`/[locale]/path`
- 中间件自动检测语言偏好（Cookie → Accept-Language → 默认 zh）
- 完整的中英文 UI 字典，覆盖导航、操作、页面文案

## 五、数据库架构

### 5.1 数据表

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `uploads` | 上传文件记录 | file_hash, file_kind, parse_status, owner_id, visibility |
| `roast_profiles` | 烘焙曲线 | 温度/风速曲线点, 处理法, 冲煮目标, 海拔范围 |
| `roast_logs` | AI 分析结果 | ai_analysis (JSON), confidence, needs_review |
| `roast_cases` | 烘焙案例沉淀 | 成功/失败标记, 豆子信息, 冲泡反馈 |
| `profiles` | 用户档案 | email, display_name, locale, role |
| `user_plans` | 订阅套餐 | plan_code, status, 周期 |
| `credit_transactions` | 按量扣费记录 | amount, reason |
| `usage_events` | 用量事件 | charge_source, usage_day, usage_month |
| `payment_orders` | 支付订单 | order_type, amount_cny, status |
| `curve_documents` | 用户编辑的曲线文档 | 完整曲线数据, visibility, 版本同步 |
| `curve_versions` | 曲线版本历史 | version_number, snapshot (JSON) |
| `share_pages` | 分享页 | slug, template, 引文, AI 预测 |

### 5.2 安全策略

- 所有表启用 Row Level Security
- 用户数据默认私有，通过 `visibility` 字段控制公开/未列出
- 文件哈希去重：同一用户不能上传相同文件两次
- 服务端 API 使用 Service Role Key 绕过 RLS，浏览器端永不暴露

## 六、关键数据流

### 上传分析流程

```
用户选择文件 (.kpro / log图片)
  → 客户端验证（大小 ≤ 6MB）
  → POST /api/uploads/analyze（需登录）
  → 哈希去重检查
  → 文件分类（kpro / log_image / unknown）
  → 分支处理：
      .kpro → parseKpro() 解析元数据与曲线点
      log图片 → analyzeRoastLogImage() AI视觉分析
  → 上传到 Supabase Storage
  → 写入 uploads / roast_profiles / roast_logs 表
  → 扣减额度（subscription → credits → free）
  → 返回分析结果 + 额度快照
```

### 曲线编辑与分享流程

```
用户进入曲线编辑器
  → 新建 / 导入 .kpro / 从库中加载
  → 编辑元数据、温度曲线、风速曲线
  → 保存 → curve_documents (INSERT/UPDATE)
         → curve_versions (自动递增版本)
  → 下载 .kpro / 创建分享页
  → 分享页生成唯一 slug → 公开访问 /share/[slug]
```

## 七、运行时配置

项目支持两种配置方式：

1. **.env.local 文件**（本地开发）：通过后台 `/admin/settings` 页面可写入/更新环境变量，包括 Supabase 连接信息、AI 提供商、API Key 等
2. **Vercel 环境变量**（生产部署）：直接使用 Vercel Project Settings 中的环境变量

关键环境变量：
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`（服务端专用）
- `AI_API_KEY` / `AI_BASE_URL` / `AI_VISION_MODEL`
- `ADMIN_ACCESS_TOKEN`（保护写操作）

## 八、质量保障

- **类型检查**：TypeScript 严格模式，`npm run typecheck`
- **代码检查**：ESLint + Next.js 配置，`npm run lint`
- **单元测试**：Vitest，覆盖 .kpro 解析、上传分类、额度计算等核心逻辑
- **CI/CD**：Vercel 部署，生产部署前通过构建验证

## 九、当前状态与待改进点

### 当前实现
- 基础 .kpro 上传解析完整可用
- AI log 图片分析可通过配置的视觉模型工作
- 曲线编辑器和版本管理已实现
- 分享页系统已实现（三种模板）
- SaaS 额度系统已实现（三级套餐 + 按量计费）
- Supabase Auth 邮箱登录已实现
- 中英双语支持完整

### 可观察的改进空间
1. **支付集成**：当前 `payments.ts` 仅有 manual provider 骨架，未接入真实支付渠道（如 Stripe、支付宝）
2. **AI 分析增强**：当前 log 图片分析依赖单一的 prompt 工程方案，可考虑加入更多上下文（历史案例、官方曲线对比）提升准确度
3. **案例系统**：`roast_cases` 表已建但前端交互较浅，案例的沉淀-检索-复用闭环有待完善
4. **曲线推荐引擎**：recommend 页面的推荐逻辑目前较基础，可利用官方知识库 + 用户历史数据做更智能的匹配
5. **移动端适配**：当前 UI 以桌面端 sidebar 布局为主，移动端体验可进一步优化
6. **国际化完整性**：部分字符串（如官方知识库的分析建议）中英文均已覆盖，但个别模板文案可能仍以中文为主

## 十、总结

**Kaffelogic Roast Advisor** 是一个功能完整、架构清晰的垂直领域 SaaS 应用。它将 Kaffelogic 烘焙机的曲线管理、AI log 分析、案例沉淀和分享整合到一个统一的 Web 工作台上。项目采用了现代化的 Next.js + Supabase 技术栈，具备良好的代码组织结构、完善的类型系统和数据库安全策略。核心的 .kpro 解析引擎和官方知识库模块体现了深入的领域知识积累，额度系统则为商业化做好了准备。
