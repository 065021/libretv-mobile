/**
 * hls.js 的原生传输 loader（仅 App 内启用）。
 *
 * hls.js 默认 loader 走 XMLHttpRequest，在 WebView 里请求 m3u8 / 分片会被 CORS 拦下。
 * 这里换成基于 fetch 的实现，而 fetch 已被 runtime.ts 接管：
 * - /api/proxy、/api/live/stream 这类代理地址在本地就被解析（走原生 HTTP 取流），
 *   完全不经过网络层，也就没有跨域问题；
 * - 直连地址同样由原生 HTTP 发出，不受同源限制。
 *
 * 与 Web 版 loader 的关系：这里只提供「底座」，广告过滤与分片缓存仍由
 * lib/hls-loader.ts 的 createHlsLoader 组合（它接受自定义基类）。
 */
import type HlsType from 'hls.js';
import { nativeFetch } from './native-http';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLoaderCtor = new (config: any) => any;

/** 代理地址由本地分发器处理，直连地址才需要原生 HTTP */
function isLocalApiUrl(url: string): boolean {
  return url.startsWith('/api/') || url.includes('/api/proxy') || url.includes('/api/live/stream');
}

/**
 * 返回可直接作为 hls.js loader 基类的构造器；非 App 环境返回 undefined，
 * 调用方据此保留 hls.js 默认 loader。
 */
export function createNativeHlsLoader(HlsCtor: typeof HlsType): AnyLoaderCtor | undefined {
  if (process.env.MOBILE_BUILD !== '1' || typeof window === 'undefined') return undefined;

  const Base = HlsCtor.DefaultConfig.loader as unknown as AnyLoaderCtor;

  return class NativeHlsLoader extends Base {
    private controller: AbortController | null = null;
    private cancelled = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    load(context: any, config: any, callbacks: any): void {
      this.controller = new AbortController();
      this.cancelled = false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stats = (this as any).stats;
      const start = performance.now();
      stats.loading.start = start;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const headers: Record<string, string> = { ...((config && config.headers) || {}) };
      if (context.rangeStart != null) {
        headers.Range = `bytes=${context.rangeStart}-${context.rangeEnd != null ? context.rangeEnd : ''}`;
      }

      const responseType = context.responseType;
      const method = context.method || 'GET';

      // 代理地址：交给本地分发器（内部再走原生 HTTP）；
      // 直连地址：直接走原生 HTTP，否则 WebView 里的跨域请求会被拦掉
      const request = isLocalApiUrl(context.url)
        ? fetch(context.url, { method, headers, signal: this.controller.signal })
        : nativeFetch(context.url, {
            method,
            headers,
            signal: this.controller.signal,
            timeoutMs: 30000,
          }).then((r) => r.res);

      request
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = await res.arrayBuffer();
          if (this.cancelled) return;
          const end = performance.now();
          Object.assign(stats, {
            loading: { start, first: end, end },
            total: buffer.byteLength,
            loaded: buffer.byteLength,
          });
          const data = responseType === 'arraybuffer' ? buffer : new TextDecoder('utf-8').decode(buffer);
          callbacks.onSuccess({ url: res.url || context.url, data }, stats, context, res);
        })
        .catch((err: unknown) => {
          if (this.cancelled) return;
          callbacks.onError(
            { code: 0, text: err instanceof Error ? err.message : '网络请求失败' },
            context,
            null,
            stats
          );
        });
    }

    abort(): void {
      this.cancelled = true;
      this.controller?.abort();
      super.abort();
    }

    destroy(): void {
      this.cancelled = true;
      this.controller?.abort();
      super.destroy?.();
    }
  };
}
