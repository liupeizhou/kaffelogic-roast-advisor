# Kaffelogic Roast Advisor 首页交互改版提示词

你是 Claude Opus 4.8，请在当前 Next.js 项目基础上，只改首页前端体验。目标是把首页改成一个高级、克制、沉浸式的小型咖啡烘焙实验室场景：画面里同时有 Kaffelogic 烘焙机、MacBook、咖啡豆盘。用户鼠标移动到不同物体时出现对应浮动标签和轻量交互。

## 当前项目上下文

- 技术栈：Next.js 15 App Router、React 19、Ant Design 6、lucide-react。
- 首页入口：`app/[locale]/page.tsx`
- 首页组件：`components/home-page.tsx`
- 全局样式：`app/globals.css`
- 文案字典：`lib/i18n.ts`
- 当前首页已有三个主入口：推荐顾问、上传分析、曲线/案例库。
- 保持 `/zh`、`/en` 双语能力，不要破坏现有路由、登录、额度、上传、曲线库、管理后台。

## 设计目标

首页首屏改为一个暗色蒙版的真实感场景，感觉像一个安静、专业、少量光线照亮的咖啡小型烘焙实验室。画面中必须清楚出现：

1. Kaffelogic 类小型流化床烘焙机，位置建议在画面左中或中左。
2. MacBook，屏幕上有烘焙曲线界面，位置建议在画面右中。
3. 一盘咖啡生豆或熟豆，位置建议在画面下方偏右或前景。

整体风格：

- 高级、克制、专业，不要花哨。
- 暗色背景加柔和聚光，文字清晰。
- 不要做营销感很强的大色块渐变。
- 不要用卡片堆叠首页主视觉。
- 首屏应该是沉浸式背景图 + 暗色蒙版 + 精简文字 + 三个可交互热点。
- 保留现有产品功能入口，但降低视觉噪音。

## 底图生成要求

使用 image2 或同等级图片生成模型生成一张真实感 bitmap 背景图，保存到：

`public/images/kaffelogic-roast-lab-hero.webp`

建议尺寸：

- 2400 x 1500 或 1920 x 1200
- 横向构图，适合桌面首屏
- 需要给移动端留裁切空间

### image2 生成提示词

```text
A quiet premium micro coffee roasting lab on a dark walnut workbench, a compact white cylindrical Kaffelogic-style fluid bed coffee roaster on the left, a silver MacBook on the right showing elegant coffee roasting temperature curves and ROR chart on screen, a shallow ceramic tray of green coffee beans and a few roasted beans in the foreground, subtle warm task lighting, dark neutral background, professional specialty coffee workspace, realistic photography, restrained luxury, high detail, clean composition, no people, no text, no logos, no brand marks, cinematic but understated, soft reflections, 35mm lens, shallow depth of field, natural shadows, high-end editorial product photography
```

负面提示：

```text
cartoon, illustration, vector, overly bright, neon, cluttered desk, people, hands, readable logos, fake text, distorted laptop, extra screens, messy cables, fantasy, steampunk, excessive steam, oversaturated colors
```

如果生成图里出现真实商标或错误文字，请重新生成或局部修复，最终图上不要有可读品牌 logo。

## 首页交互要求

在 `components/home-page.tsx` 中把原来的 `machine-panel-card` 主视觉替换为沉浸式场景。

首屏结构建议：

- 外层：`section.home-lab-hero`
- 背景图：使用 CSS `background-image: url("/images/kaffelogic-roast-lab-hero.webp")`
- 叠加暗色蒙版：`linear-gradient` 或伪元素，确保文字可读。
- 左侧或下方放现有首页标题、简介、主按钮。
- 场景上放 3 个透明热点按钮，支持 hover 和 keyboard focus。

三个热点：

1. 烘焙机热点
   - 悬停/聚焦文案：中文 `学习烘焙`，英文 `Learn roasting`
   - 点击跳转：`/${locale}/recommend`
   - 可附小字：中文 `从处理法、产区和目标烘焙度开始选择曲线。`

2. MacBook 热点
   - 悬停/聚焦文案：中文 `烘焙曲线`，英文 `Roast curves`
   - 点击跳转：`/${locale}/library`
   - 可附小字：中文 `查看动态曲线、评分、标签和案例。`

3. 咖啡豆盘热点
   - 悬停/聚焦文案：中文 `咖啡豆`，英文 `Green coffee`
   - 点击跳转：`/${locale}/upload`
   - 可附小字：中文 `上传 .kpro、.klog 或 log 图片做分析。`

热点视觉：

- 默认只显示一个很克制的小圆点或细线框，不要大面积遮挡底图。
- hover/focus 时出现浮动标签，标签应有玻璃感或深色半透明背景。
- 标签用 `position: absolute` 放在热点附近。
- 加轻微位移和透明度动画，150-220ms 即可。
- 鼠标离开后标签消失。
- 必须支持键盘聚焦，不能只支持鼠标。

移动端：

- 不依赖 hover。
- 三个热点在背景图下方或底部浮层中变成三个紧凑按钮。
- 保持首屏不拥挤，不要让文字压住关键图像。

## 具体实现建议

### 1. 修改 `components/home-page.tsx`

- 保留 `getDictionary(locale)` 和 `withLocale(locale, path)`。
- 可以删除原 `machine-panel-card` 视觉模拟块。
- 新增热点数组：

```ts
const hotspots = [
  {
    key: "roaster",
    label: locale === "zh" ? "学习烘焙" : "Learn roasting",
    description: locale === "zh" ? "从处理法、产区和目标烘焙度开始选择曲线。" : "Start from process, origin and target roast degree.",
    href: withLocale(locale, "/recommend"),
    className: "hotspot-roaster"
  },
  {
    key: "macbook",
    label: locale === "zh" ? "烘焙曲线" : "Roast curves",
    description: locale === "zh" ? "查看动态曲线、评分、标签和案例。" : "Browse animated curves, scoring, tags and cases.",
    href: withLocale(locale, "/library"),
    className: "hotspot-macbook"
  },
  {
    key: "beans",
    label: locale === "zh" ? "咖啡豆" : "Green coffee",
    description: locale === "zh" ? "上传 .kpro、.klog 或 log 图片做分析。" : "Upload .kpro, .klog or log screenshots for analysis.",
    href: withLocale(locale, "/upload"),
    className: "hotspot-beans"
  }
];
```

- 用 `Link` 包裹热点按钮，保证点击跳转。
- Ant Design `Button` 仍可用于主 CTA，但场景热点建议用原生 `button` 或 `span` 结构配合 `Link`。
- 不要引入新的大型依赖。

### 2. 修改 `app/globals.css`

新增或替换首页相关 class：

- `.home-lab-hero`
- `.home-lab-hero::before`
- `.home-lab-copy`
- `.lab-hotspot`
- `.lab-hotspot-dot`
- `.lab-hotspot-card`
- `.hotspot-roaster`
- `.hotspot-macbook`
- `.hotspot-beans`
- 移动端 media query

热点位置建议先用百分比：

```css
.hotspot-roaster { left: 24%; top: 45%; }
.hotspot-macbook { left: 68%; top: 42%; }
.hotspot-beans { left: 72%; top: 72%; }
```

实际以生成图为准微调，不要硬套。

### 3. 保留功能入口

首屏下方可以继续保留原来的 `metric-row` 和三个 `Feature` 卡片，但视觉上要弱化，不要抢首屏主视觉。

如果首屏太长，可将数据卡片放到下一屏，首屏底部露出下一屏一点点内容。

## 验收标准

完成后必须检查：

- `/zh` 首页正常渲染。
- `/en` 首页正常渲染。
- 三个热点 hover/focus 都能显示浮动标签。
- 三个热点点击分别进入推荐、曲线库、上传分析。
- 移动端 390px 宽度下没有文字重叠、按钮溢出、热点遮挡严重问题。
- 暗色蒙版下标题和按钮对比度足够。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。

## 不要做的事

- 不要改 Supabase、鉴权、额度、上传 API、曲线解析逻辑。
- 不要动管理后台入口和权限。
- 不要把任何 API key、service role key、AI key 写到前端。
- 不要用 SVG 假插画替代真实 bitmap 场景图。
- 不要做大面积紫蓝渐变、霓虹赛博风或过度装饰。
- 不要让首页变成纯营销落地页；它仍然应该是用户进入烘焙工作台的第一屏。

## 交付说明

请输出：

1. 修改文件列表。
2. 生成图文件路径。
3. 交互热点位置说明。
4. 已运行的验证命令和结果。
5. 如果因为没有 image2 权限无法生成图片，请先使用明确的占位图片路径和 TODO 注释，但不要改变组件结构。
