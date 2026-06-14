const ADMIN_TOKEN_KEY = "kaffelogic-admin-token";

export function getStoredAdminToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
}

export function setStoredAdminToken(token: string): void {
  if (typeof window === "undefined") return;
  const trimmed = token.trim();
  if (trimmed) {
    window.localStorage.setItem(ADMIN_TOKEN_KEY, trimmed);
  } else {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}

export function adminHeaders(token = getStoredAdminToken()): Record<string, string> {
  const trimmed = token.trim();
  return trimmed ? { "x-admin-token": trimmed } : {};
}
