import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 配置：把静态导出的 Next.js 前端包成原生 App。
 *
 * - webDir 指向 `next build` 的导出目录 out/；
 * - androidScheme 用 https，WebView 里是安全上下文（IndexedDB / MSE / WakeLock 才可用）；
 * - allowMixedContent 放行 http 资源：大量 IPTV 源与采集站仍是 http，
 *   不放行会整片播不了（iOS 侧对应 Info.plist 的 NSAllowsArbitraryLoads）。
 */
const config: CapacitorConfig = {
  appId: 'com.libretv.app',
  appName: 'LibreTV',
  webDir: 'out',
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'never',
    limitsNavigationsToAppBoundDomains: false,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // 不启用全局 fetch/XHR 补丁：请求出口由 src/mobile/native-http.ts 显式控制，
    // 全局补丁会把 WebView 内的同源静态资源请求也劫持到原生层。
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
