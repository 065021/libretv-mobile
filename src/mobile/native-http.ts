/**
 * 原生 HTTP 传输层。
 *
 * WebView 里的 fetch 受同源策略约束，而 LibreTV 的采集站 / 豆瓣 / IPTV 源
 * 几乎都不发 Access-Control-Allow-Origin，直接用浏览器 fetch 必然被拦。
 * App 内改用 Capacitor 的原生 HTTP（Android: OkHttp，iOS: URLSession）发出请求：
 * 不受 CORS 约束、可自定义 UA/Referer、自动跟随重定向，语义上等价于原来服务端的 fetch。
 *
 * 因此原来写在 Route Handler 里的逻辑可以原样搬进 WebView 执行，
 * 只是把最底层的 fetch 换成本文件的 nativeFetch。
 */
import { IS_MOBILE_BUILD } from './platform';

/** 不允许透传给原生层的头（由 HTTP 栈自行管理，手写会破坏请求） */
const DROPPED_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'accept-encoding',
  'content-encoding',
  'transfer-encoding',
  'origin',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-dest',
]);

export interface NativeRequestInit {
  method?: string;
  headers?: HeadersInit | null;
  body?: BodyInit | null;
  /** 连接 / 读取超时（毫秒） */
  timeoutMs?: number;
  signal?: AbortSignal | null;
}

export interface NativeFetchResult {
  res: Response;
  /** 跟随重定向后的最终地址（解析 m3u8 相对地址必须用它） */
  finalUrl: string;
}

function normalizeHeaders(input: NativeRequestInit['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  const entries: [string, string][] =
    typeof Headers !== 'undefined' && input instanceof Headers
      ? (Array.from(input.entries()) as [string, string][])
      : Array.isArray(input)
        ? (input as [string, string][])
        : Object.entries(input as Record<string, string>);
  for (const [k, v] of entries) {
    if (!k || v == null) continue;
    if (DROPPED_HEADERS.has(k.toLowerCase())) continue;
    out[k] = String(v);
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 非原生环境的回退：优先用 runtime.ts 保存的原始 fetch，避免与 fetch 拦截器互相递归 */
function fallbackFetch(): typeof fetch {
  if (typeof window === 'undefined') return fetch;
  const saved = (window as unknown as Record<string, unknown>)['__libretvOriginalFetch'];
  return (saved as typeof fetch | undefined) ?? window.fetch.bind(window);
}

/**
 * 发一次原生请求，返回标准 Response。
 * 二进制统一以 arraybuffer 取回（base64 → Uint8Array），文本响应仍可正常 .text()/.json()。
 */
export async function nativeFetch(url: string, init: NativeRequestInit = {}): Promise<NativeFetchResult> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = normalizeHeaders(init.headers);
  const timeoutMs = init.timeoutMs ?? 20000;
  const body = typeof init.body === 'string' ? init.body : init.body == null ? undefined : String(init.body);

  // 桌面浏览器里预览 App 产物时退回普通 fetch（受 CORS 限制，仅供调试）
  if (!IS_MOBILE_BUILD) {
    const res = await fallbackFetch()(url, {
      method,
      headers,
      body: body as BodyInit | undefined,
      signal: init.signal ?? undefined,
    });
    return { res, finalUrl: res.url || url };
  }

  const { Capacitor, CapacitorHttp } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) {
    const res = await fallbackFetch()(url, {
      method,
      headers,
      body: body as BodyInit | undefined,
      signal: init.signal ?? undefined,
    });
    return { res, finalUrl: res.url || url };
  }

  const request = CapacitorHttp.request({
    url,
    method,
    headers,
    data: body,
    // 原生层不支持流式读取，统一取完整字节；文本响应后续由 Response 自行解码
    responseType: 'arraybuffer',
    connectTimeout: timeoutMs,
    readTimeout: timeoutMs,
  });

  // 原生请求无法中途 abort，用 signal 做逻辑上的提前返回，避免界面卡在等待
  const signal = init.signal;
  const payload = await (signal
    ? Promise.race([
        request,
        new Promise<never>((_, reject) => {
          if (signal.aborted) reject(new DOMException('已取消', 'AbortError'));
          signal.addEventListener('abort', () => reject(new DOMException('已取消', 'AbortError')), {
            once: true,
          });
        }),
      ])
    : request);

  // 原生层对 binary 类型返回 base64 字符串；
  // 浏览器实现（调试态）在 JSON 响应上会直接把对象塞进 data，这里统一兜住
  const raw = payload.data as unknown;
  let bytes: Uint8Array;
  if (raw == null) {
    bytes = new Uint8Array(0);
  } else if (typeof raw === 'string') {
    bytes = raw ? base64ToBytes(raw) : new Uint8Array(0);
  } else {
    bytes = new TextEncoder().encode(JSON.stringify(raw));
  }

  const outHeaders = new Headers();
  for (const [k, v] of Object.entries(payload.headers || {})) {
    const key = k.toLowerCase();
    // 已经解压/重新组包过的响应不能带这些头，否则浏览器二次处理会报错
    if (key === 'content-encoding' || key === 'content-length' || key === 'transfer-encoding') continue;
    try {
      outHeaders.set(k, String(v));
    } catch {
      /* 非法头名忽略 */
    }
  }

  const status = payload.status || 200;
  const hasBody = status !== 204 && status !== 205 && status !== 304 && bytes.byteLength > 0;
  const res = new Response(hasBody ? (bytes as unknown as BodyInit) : null, { status, headers: outHeaders });

  return { res, finalUrl: payload.url || url };
}

/** 直接取文本（采集站接口、m3u8 等） */
export async function nativeText(url: string, init: NativeRequestInit = {}): Promise<string> {
  const { res } = await nativeFetch(url, init);
  return res.text();
}
