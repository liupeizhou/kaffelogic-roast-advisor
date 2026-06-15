export const LOCALES = ["zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "zh";

export const dictionaries = {
  zh: {
    appName: "Kaffelogic Roast Advisor",
    status: "产品工作台",
    nav: {
      recommend: "推荐顾问",
      upload: "上传分析",
      library: "曲线/案例库",
      editor: "曲线编辑器",
      account: "账户与额度",
      adminHome: "管理概览",
      adminLibrary: "曲线导入",
      users: "用户授权",
      settings: "后台配置",
      frontend: "客户前台",
      admin: "管理后台"
    },
    actions: {
      upload: "上传分析",
      configure: "配置模型",
      signIn: "登录",
      signOut: "退出",
      language: "English",
      save: "保存",
      download: "下载 .kpro",
      share: "生成分享页"
    },
    home: {
      title: "曲线、log 与烘焙决策，放进同一个精确工作台。",
      lede: "上传 `.kpro` 曲线或 Kaffelogic log 图，解析曲线、识别关键节点、沉淀案例，再回到下一锅的推荐判断。",
      cards: {
        recommend: "按处理法、产地、海拔、风味和目标烘焙度选择曲线。",
        upload: "解析 `.kpro`，或分析 log 图片里的 FC、ROR、结束点和风险。",
        library: "沉淀上传曲线、成功案例、失败案例和通用操作知识。"
      }
    },
    login: {
      title: "邮箱验证码登录",
      lede: "输入邮箱获取 6 位验证码。登录后可以上传分析、编辑曲线、保存版本和生成分享页。",
      email: "邮箱",
      code: "验证码",
      send: "发送验证码",
      verify: "验证并登录",
      sent: "验证码已发送，请查看邮箱。",
      invalid: "请输入有效邮箱和 6 位验证码。"
    },
    quota: {
      title: "账户与额度",
      free: "免费额度",
      balance: "按量余额",
      plan: "当前套餐",
      today: "今日剩余",
      month: "本月剩余",
      credits: "按量次数"
    },
    uploadPage: {
      eyebrow: "上传分析",
      title: "读取曲线文件，也解读 log 截图。",
      lede: "登录后上传 `.kpro` 或 Kaffelogic log 图片。成功分析会按 GMT+8 计入当日额度。",
      selectFile: "选择文件",
      analyze: "分析上传",
      hint: "支持 .kpro、.klog 和 Kaffelogic log 图片，单文件最大 6MB。",
      quotaHint: "成功分析后扣减额度；失败和非法文件不扣。"
    },
    editor: {
      eyebrow: "曲线编辑器",
      title: "编辑 Kaffelogic 曲线，保存版本并下载分享。",
      lede: "导入 `.kpro`、编辑关键字段和曲线点，保存为个人曲线文档。",
      newCurve: "新建曲线",
      importKpro: "导入 .kpro",
      metadata: "曲线信息",
      tempCurve: "温度曲线",
      fanCurve: "风速曲线",
      rawFields: "Raw 字段",
      versions: "版本"
    },
    share: {
      title: "曲线分享",
      notFound: "分享页不存在或尚未公开。",
      image: "分享长图",
      barista: "咖啡师",
      baroque: "巴洛克",
      cyberpunk: "赛博朋克"
    }
  },
  en: {
    appName: "Kaffelogic Roast Advisor",
    status: "Product bench",
    nav: {
      recommend: "Advisor",
      upload: "Upload Analysis",
      library: "Profiles & Cases",
      editor: "Curve Editor",
      account: "Account & Quota",
      adminHome: "Admin Overview",
      adminLibrary: "Profile Import",
      users: "User Grants",
      settings: "Admin Settings",
      frontend: "Customer App",
      admin: "Admin Console"
    },
    actions: {
      upload: "Analyze Upload",
      configure: "Configure Model",
      signIn: "Sign in",
      signOut: "Sign out",
      language: "中文",
      save: "Save",
      download: "Download .kpro",
      share: "Create Share"
    },
    home: {
      title: "Roast profiles, logs and decisions in one precise bench.",
      lede: "Upload `.kpro` profiles or Kaffelogic log images, extract key milestones, build cases, and turn the next roast into a clearer decision.",
      cards: {
        recommend: "Choose profiles by process, origin, altitude, flavor and target roast degree.",
        upload: "Parse `.kpro` files or diagnose FC, ROR, end point and roast risks from log images.",
        library: "Keep reference curves, successful cases, failed cases and operational knowledge in one place."
      }
    },
    login: {
      title: "Email code sign-in",
      lede: "Enter your email to receive a 6-digit code. Once signed in, you can analyze uploads, edit curves, save versions and create share pages.",
      email: "Email",
      code: "Code",
      send: "Send code",
      verify: "Verify and sign in",
      sent: "Code sent. Check your email.",
      invalid: "Enter a valid email and 6-digit code."
    },
    quota: {
      title: "Account & Quota",
      free: "Free quota",
      balance: "Pay-as-you-go balance",
      plan: "Current plan",
      today: "Today left",
      month: "This month left",
      credits: "Credits"
    },
    uploadPage: {
      eyebrow: "Upload Analysis",
      title: "Read profile files and diagnose log screenshots.",
      lede: "Upload `.kpro` files or Kaffelogic log images after signing in. Successful analyses count against your GMT+8 daily quota.",
      selectFile: "Select file",
      analyze: "Analyze upload",
      hint: "Supports .kpro, .klog and Kaffelogic log images, max 6MB per file.",
      quotaHint: "Only successful analyses consume quota; invalid or failed files do not."
    },
    editor: {
      eyebrow: "Curve Editor",
      title: "Edit Kaffelogic curves, save versions and share.",
      lede: "Import `.kpro`, edit metadata and curve points, then save a personal curve document.",
      newCurve: "New curve",
      importKpro: "Import .kpro",
      metadata: "Profile metadata",
      tempCurve: "Temperature curve",
      fanCurve: "Fan curve",
      rawFields: "Raw fields",
      versions: "Versions"
    },
    share: {
      title: "Curve Share",
      notFound: "This share page does not exist or is not public yet.",
      image: "Share image",
      barista: "Barista",
      baroque: "Baroque",
      cyberpunk: "Cyberpunk"
    }
  }
} as const;

export type Dictionary = (typeof dictionaries)[Locale];

export function isLocale(value: string | undefined): value is Locale {
  return value === "zh" || value === "en";
}

export function normalizeLocale(value: string | undefined | null): Locale {
  if (isLocale(value ?? undefined)) return value as Locale;
  return DEFAULT_LOCALE;
}

export function getDictionary(locale: string | undefined): Dictionary {
  return dictionaries[normalizeLocale(locale)];
}

export function withLocale(locale: Locale, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${normalizedPath === "/" ? "" : normalizedPath}`;
}

export function stripLocale(pathname: string): { locale: Locale; path: string } {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];
  const locale = normalizeLocale(first);
  const stripped = isLocale(first) ? `/${segments.slice(1).join("/")}` : pathname;
  const path = stripped === "/" ? "/" : stripped.replace(/\/$/, "") || "/";
  return { locale, path };
}
