/**
 * App 运行时装配：把网络出口接管到原生通道。
 *
 * 两条规则：
 * 1. 本站 /api/* → 就地分发给本地实现（原来服务端的 Route Handler）；
 * 2. 其余跨域 http(s) 请求 → 走原生 HTTP（Android OkHttp / iOS URLSession），
 *    彻底绕开 WebView 的同源策略；同源的静态资源仍走 WebView 自身。
 *
 * 为什么要在 fetch 这一层做：全站有几十处 fetch（含流式 NDJSON、预取器、下载器、
 * 播放器兜底换源），逐个改调用方既容易漏又难维护；在出口处统一接管，
 * 前端与服务端逻辑都能保持零改动。
 */
import { isNativeApp } from './platform';

let installed = false;

/** 原始 fetch 的全局引用：nativeFetch 在非原生环境回退时用它，避免与拦截器互相递归 */
const ORIGINAL_FETCH_KEY = '__libretvOriginalFetch';

function getOriginalFetch(): typeof fetch {
  const saved = (window as unknown as Record<string, unknown>)[ORIGINAL_FETCH_KEY];
  return (saved as typeof fetch | undefined) ?? window.fetch.bind(window);
}

export function installMobileRuntime(): void {
  if (installed || !isNativeApp()) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  (window as unknown as Record<string, unknown>)[ORIGINAL_FETCH_KEY] = originalFetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    let url: URL;
    try {
      url = new URL(rawUrl, window.location.href);
    } catch {
      return originalFetch(input as RequestInfo, init);
    }

    // —— 本站请求 ——
    if (url.origin === window.location.origin) {
      if (!url.pathname.startsWith('/api/')) return originalFetch(input as RequestInfo, init);
      try {
        const request = input instanceof Request ? new Request(input) : new Request(url.href, init);
        // 路由表体积不小（采集解析、画质探测、直播测活），首次调用时再加载
        const { dispatch } = await import('./server/router');
        return await dispatch(request);
      } catch (err) {
        return new Response(
          JSON.stringify({ error: err instanceof Error ? err.message : '本地接口调用失败' }),
          { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } }
        );
      }
    }

    // —— 跨域请求 ——
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return originalFetch(input as RequestInfo, init);
    }
    const method = (input instanceof Request ? input.method : init?.method) || 'GET';
    const headers = input instanceof Request ? input.headers : init?.headers;
    const signal = input instanceof Request ? input.signal : init?.signal;
    let body: string | undefined;
    if (method === 'GET' || method === 'HEAD') {
      body = undefined;
    } else if (input instanceof Request) {
      try {
        body = await input.clone().text();
      } catch {
        body = undefined;
      }
    } else if (typeof init?.body === 'string') {
      body = init.body;
    } else if (init?.body != null) {
      // FormData / Blob 等非字符串体量极少，退回 WebView 自身请求
      return originalFetch(input as RequestInfo, init);
    }

    const { nativeFetch } = await import('./native-http');
    const { res } = await nativeFetch(url.href, { method, headers, body, signal, timeoutMs: 30000 });
    return res;
  };
}
