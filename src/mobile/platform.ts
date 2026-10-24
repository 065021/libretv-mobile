/**
 * 移动端（Capacitor 内置打包）运行时判定。
 *
 * MOBILE_BUILD 由 next.config.ts 注入为编译期常量：
 * - Web 构建下是 "0"，相关分支被摇树删除；
 * - 移动端构建下是 "1"，产物只用于打进 APK/IPA。
 */
export const IS_MOBILE_BUILD = process.env.MOBILE_BUILD === '1';

/** Capacitor 原生桥是否存在（注入失败时用 origin 兜底判断） */
export function hasNativeBridge(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = (window as any).Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
  // App 内的 WebView origin：iOS 为 capacitor://localhost，Android 为 https://localhost（无端口）
  return window.location.protocol === 'capacitor:' || window.location.hostname === 'localhost';
}

/** 当前是否运行在 App 内（SSR 阶段一律 false） */
export function isNativeApp(): boolean {
  return IS_MOBILE_BUILD && typeof window !== 'undefined' && hasNativeBridge();
}
