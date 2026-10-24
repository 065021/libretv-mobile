/**
 * App 内的封面图解析。
 *
 * `<img src="/api/proxy?url=...">` 在 WebView 里会去请求 https://localhost/api/proxy，
 * 而打包后的静态资源里并没有这个文件——所以代理形式的图片必须先取回二进制、
 * 再换成 blob: URL 才能显示。直连地址（豆瓣图床等）仍交给 <img> 自己加载。
 *
 * 取图走的是同一个 /api/proxy：它已经在 App 内被本地分发器接管，
 * 因此 Referer / UA 伪装、防盗链绕过的逻辑与 Web 版完全一致。
 */
import { isNativeApp } from './platform';

/** 同时最多缓存多少张 blob（超出按插入顺序淘汰并回收 URL） */
const MAX_CACHED = 240;

const cache = new Map<string, Promise<string | null>>();

/** 是否为需要本地转 blob 的代理图片地址 */
export function isProxiedImage(src: string): boolean {
  return src.startsWith('/api/proxy') || src.includes('/api/proxy?');
}

/** 直连图片地址（无需转换）原样返回 */
export async function resolveNativeImageSrc(src: string): Promise<string | null> {
  if (!isNativeApp() || !isProxiedImage(src)) return src;

  const cached = cache.get(src);
  if (cached) return cached;

  const task = (async (): Promise<string | null> => {
    try {
      const res = await fetch(src);
      if (!res.ok) return null;
      const blob = await res.blob();
      if (blob.size === 0) return null;
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  })();

  cache.set(src, task);
  if (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next();
    if (!oldest.done) {
      const url = await cache.get(oldest.value);
      cache.delete(oldest.value);
      if (url) URL.revokeObjectURL(url);
    }
  }
  return task;
}
