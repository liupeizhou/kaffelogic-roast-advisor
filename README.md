# Kaffelogic Roast Advisor

Kaffelogic 烘焙曲线推荐与上传分析原型。当前版本支持：

- 上传 `.kpro` 并解析曲线元数据、温度曲线、风速曲线。
- 上传 Kaffelogic log 图片并通过 OpenAI-compatible 视觉模型生成诊断初稿。
- 保存上传文件、曲线、log 解析和案例数据到 Supabase。
- 在曲线库中动态展示温度曲线与风速曲线。
- 后台配置本地运行所需的 Supabase 与 AI 参数。

## 本地运行

```bash
npm install
npm run dev
```

访问 `http://localhost:3000`。

## 环境变量

复制 `.env.example` 为 `.env.local`，或在 Vercel Project Settings 中配置同名变量。

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_UPLOAD_BUCKET=kaffelogic-uploads
AI_PROVIDER=siliconflow
AI_BASE_URL=https://api.siliconflow.cn/v1
AI_API_KEY=
AI_VISION_MODEL=Qwen/Qwen2.5-VL-72B-Instruct
ADMIN_ACCESS_TOKEN=
```

`ADMIN_ACCESS_TOKEN` 用于保护写操作。生产环境如果不配置它，保存配置、上传分析、人工确认和批量导入都会被禁用。

## Supabase

在 Supabase SQL Editor 或迁移流程中执行：

```text
supabase/migrations/20260614183000_kaffelogic_upload_analysis.sql
```

迁移会创建：

- `uploads`
- `roast_profiles`
- `roast_logs`
- `roast_cases`
- 私有 Storage bucket `kaffelogic-uploads`

v1 默认使用 service role key 通过服务端 API 写入数据库。不要把 service role key 放进浏览器代码。

## 部署到 Vercel

1. 创建或连接 GitHub 仓库。
2. 在 Vercel 导入该仓库。
3. 在 Vercel Project Settings 配置上述环境变量。
4. 触发 Production Deploy。

后台 `/admin/settings` 可用于本地写入 `.env.local`。在 Vercel 上，运行时文件系统不适合作为持久配置源，请以 Vercel 环境变量为准。

## 验证

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
