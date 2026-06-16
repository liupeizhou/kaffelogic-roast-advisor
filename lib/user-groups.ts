export type UserGroupCode = "management" | "premium" | "standard" | "free";

export type GroupCapability = {
  code: UserGroupCode;
  labelZh: string;
  labelEn: string;
  canAccessAdmin: boolean;
  canManageUsers: boolean;
  canImportProfiles: boolean;
  canEditCurves: boolean;
  canUploadAnalyze: boolean;
};

export const USER_GROUPS: Record<UserGroupCode, GroupCapability> = {
  management: {
    code: "management",
    labelZh: "管理组",
    labelEn: "Management",
    canAccessAdmin: true,
    canManageUsers: true,
    canImportProfiles: true,
    canEditCurves: true,
    canUploadAnalyze: true
  },
  premium: {
    code: "premium",
    labelZh: "高级订阅用户组",
    labelEn: "Premium subscribers",
    canAccessAdmin: false,
    canManageUsers: false,
    canImportProfiles: false,
    canEditCurves: true,
    canUploadAnalyze: true
  },
  standard: {
    code: "standard",
    labelZh: "标准订阅用户组",
    labelEn: "Standard subscribers",
    canAccessAdmin: false,
    canManageUsers: false,
    canImportProfiles: false,
    canEditCurves: true,
    canUploadAnalyze: true
  },
  free: {
    code: "free",
    labelZh: "普通用户组",
    labelEn: "Free users",
    canAccessAdmin: false,
    canManageUsers: false,
    canImportProfiles: false,
    canEditCurves: true,
    canUploadAnalyze: true
  }
};

export function parseAdminEmails(value = process.env.ADMIN_EMAILS ?? ""): string[] {
  return value
    .split(/[,;\n]/)
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

export function normalizeEmail(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function isAdminEmail(email?: string | null, adminEmails = parseAdminEmails()): boolean {
  const normalized = normalizeEmail(email);
  return Boolean(normalized && adminEmails.includes(normalized));
}

export function groupFromPlan(planCode: string | null | undefined, email?: string | null): UserGroupCode {
  if (isAdminEmail(email)) return "management";
  if (planCode === "pro" || planCode === "premium") return "premium";
  if (planCode === "balanced" || planCode === "standard") return "standard";
  return "free";
}

export function planFromGroup(group: string | null | undefined): "free" | "balanced" | "pro" | null {
  if (group === "premium" || group === "pro") return "pro";
  if (group === "standard" || group === "balanced") return "balanced";
  if (group === "free") return "free";
  return null;
}
