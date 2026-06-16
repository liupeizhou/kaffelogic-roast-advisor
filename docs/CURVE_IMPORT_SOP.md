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
4. 待导入目录只放真实 `.kpro` 文件；系统会跳过 `.DS_Store` 和 `._*`。

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

生产环境无法读取你本机磁盘路径，因此不要在 Vercel 页面里填写本地目录直接导入。推荐流程：

1. 在本地连接生产 Supabase 环境变量。
2. 本地打开 `/zh/admin/library` 执行导入。
3. 导入数据会直接写入生产 Supabase。
4. 生产站点 `/zh/library` 会读取同一套 Supabase 数据。

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
