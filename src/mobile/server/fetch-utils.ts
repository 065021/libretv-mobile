/**
 * `@/lib/fetch-utils` 的 App 版本（仅移动端构建通过 webpack alias 生效）。
 *
 * 保持与原模块完全一致的导出与语义，唯一区别是底层走 nativeFetch（原生 HTTP），
 * 因此 Route Handler 的代码一行不用改就能在 WebView 里跑起来。
 *
 * 与服务器版的差异：
 * - 不再逐跳手动跟随重定向做 SSRF 复检（App 内没有服务端越权面），交给原生栈自动跟随；
 * - 超时由原生 connect/read timeout 承担，信号仅用于提前返回。
 */
import { nativeFetch } from '../native-http';

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  safeRedirects?: boolean;
  allowPrivate?: boolean;
}

export interface FetchResult {
  res: Response;
  finalUrl: string;
}

export interface SafeRedirectOptions {
  allowPrivate?: boolean;
  headerTimeoutMs?: number;
}

export async function fetchWithSafeRedirects(
  url: string,
  init: Omit<RequestInit, 'redirect'> = {},
  options: SafeRedirectOptions = {}
): Promise<FetchResult> {
  const { allowPrivate = false, headerTimeoutMs } = options;
  void allowPrivate;
  return nativeFetch(url, {
    method: init.method,
    headers: init.headers as Record<string, string> | Headers | null,
    body: init.body as BodyInit | null,
    signal: init.signal ?? null,
    timeoutMs: headerTimeoutMs ?? 15000,
  });
}

export async function fetchUpstream(url: string, options: FetchOptions = {}): Promise<Response> {
  return (await fetchUpstreamWithMeta(url, options)).res;
}

export async function fetchUpstreamWithMeta(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const { timeoutMs = 8000, retries = 0, safeRedirects = true, allowPrivate = false, ...init } = options;
  void safeRedirects;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithSafeRedirects(url, init, { allowPrivate, headerTimeoutMs: timeoutMs });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('上游请求失败');
}

export async function fetchUpstreamJson<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const res = await fetchUpstream(url, options);
  if (!res.ok) throw new Error(`上游请求失败: ${res.status}`);
  return (await res.json()) as T;
}

/** 内存 TTL 缓存（与原模块同实现，进程内即 WebView 内单例） */
const cache = new Map<string, { value: unknown; expiresAt: number }>();

export function getCache<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCache(key: string, value: unknown, ttlMs: number): void {
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expiresAt) cache.delete(k);
    }
    if (cache.size > 500) cache.clear();
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}
