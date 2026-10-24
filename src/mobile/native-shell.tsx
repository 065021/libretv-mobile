'use client';

import { useEffect } from 'react';
import { isNativeApp } from './platform';

/**
 * 原生外壳行为：
 * - 安卓实体返回键：优先退回上一页，已在首页则退出 App（否则 WebView 默认行为是直接退出，
 *   在播放页误触会丢掉整个会话）；
 * - 应用切到后台时不做额外处理，播放由系统自行暂停。
 */
export function NativeShell() {
  useEffect(() => {
    if (!isNativeApp()) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack || window.history.length > 1) {
            window.history.back();
          } else {
            void App.exitApp();
          }
        });
        if (cancelled) {
          void handle.remove();
          return;
        }
        cleanup = () => void handle.remove();
      } catch {
        /* 插件不可用时忽略，退回系统默认行为 */
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
