# 曲线数据库导入 SOP

## 目标

把 Kaffelogic 官方、社区或自有 `.kpro` 曲线导入 Supabase，进入 `roast_profiles` 公开/私有曲线库，供上传评分、推荐顾问和曲线库展示使用。

## 前置检查

1. Vercel / `.env.local` 已配置：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` 或 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_UPLOAD_BUCKET=kaffelogic-uploads`
   - `ADMIN_EMAILS`
2. Supabase 已执行 `supabase/migrations/` 下全部迁移。
3. 登录邮箱必须在 `ADMIN_EMAILS` 白名单中。
4. 批量导入只处理真实 `.kpro` 文件；系统会跳过 `.DS_Store` 和 `._*`。

## 本地导入

1. 启动本地服务：

```bash
npm run dev
```

2. 浏览器打开：

```text
http://localhost:3000/zh/admin/library
```

3. 用管理员邮箱验证码登录。
4. 在“参考曲线导入”里填写本机目录，例如：

```text
/Volumes/Extreme SSD/01_下载归档_Downloads/kaffelogic项目
```

5. 点击“扫描并写入 Supabase”。
6. 导入后到 `/zh/library` 检查曲线数量、曲线名、温度曲线和风速曲线是否正常。

## 生产导入

生产环境使用“选择多个 .kpro 直接导入”，不依赖服务器读取本地磁盘路径：

1. 打开：

```text
https://www.kaffelogic.cn/zh/admin/library
```

2. 用 `ADMIN_EMAILS` 白名单内的管理员邮箱验证码登录。
3. 点击“选择多个 .kpro 直接导入”。
4. 一次选择多条 `.kpro` 文件。
5. 点击“上传并导入 N 条”。
6. 导入数据会写入生产 Supabase，并在 `/zh/library`、上传评分参考下拉和 `/zh/leaderboard` 中可见。

“本地开发：按服务器目录扫描”只适合本地 `npm run dev` 时使用；Vercel 生产环境请使用文件上传导入。

## 导入后核对

1. 曲线库能看到新增曲线。
2. 上传分析页的“曲线评分”参考曲线下拉中能看到公开曲线。
3. 重复导入同一文件不会重复写入；系统按文件 hash 去重。
4. 若曲线缺少名称、温度点或风速点，先在曲线编辑器修正后保存为个人曲线。

## 用户个人曲线

用户自己的曲线不走后台批量导入：

1. 打开 `/zh/editor`。
2. 导入 `.kpro` 或手动编辑。
3. 填写曲线名字，补充生豆字段。
4. 保存后进入“我的曲线数据库”。
5. 上传分析页评分时，可以在参考曲线里选择“我的曲线数据库”中的曲线。
