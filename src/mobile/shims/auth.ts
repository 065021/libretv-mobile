/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * 会话鉴权的 App 替身（仅移动端构建通过 webpack alias 生效）。
 * App 内不启用密码登录：isPasswordConfigured 恒为 false，
 * 客户端据此不会弹登录框，直接进入正常使用流程。
 */
export const SESSION_COOKIE = 'libretv_session';

export function isPasswordConfigured(): boolean {
  return false;
}

export function sessionFromCookieHeader(_cookie?: string | null): boolean {
  return false;
}

export function checkRateLimit(_ip: string): boolean {
  return true;
}

export function clearRateLimit(_ip: string): void {
  /* noop */
}

export function checkPassword(_password: string): boolean {
  return true;
}

export function signSession(): { token: string; expiresAt: number } {
  return { token: 'app', expiresAt: Date.now() + 24 * 3600 * 1000 };
}
