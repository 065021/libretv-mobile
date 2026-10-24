'use client';

import { useEffect, useState } from 'react';
import { buildImageCandidates } from '@/lib/utils';
import { isNativeApp } from '@/mobile/platform';
import { isProxiedImage, resolveNativeImageSrc } from '@/mobile/image';

interface SmartImageProps {
  /** 原始图片地址（未经代理加工，降级链由本组件按加载方式生成） */
  url?: string;
  mode: 'direct' | 'proxy' | 'custom';
  customProxy?: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  /** 候选链耗尽后回调，调用方切换占位图等兜底 UI */
  onExhausted?: () => void;
}

/**
 * 带降级链的封面图组件：direct 模式按 buildImageCandidates 的顺序加载，
 * onError 逐级回退（豆瓣图：直连 → 公共镜像 → 内置代理）；
 * 全部失败后触发 onExhausted 并停止渲染，由调用方展示占位图。
 * referrerPolicy=no-referrer：不向图床暴露来源页，规避部分站点的 Referer 校验。
 *
 * App 内多一步：代理形式的地址（/api/proxy?url=…）不是静态文件，
 * 必须先取回二进制转成 blob: URL，否则 WebView 会去请求一个不存在的路径。
 */
export function SmartImage({
  url,
  mode,
  customProxy = '',
  alt,
  className,
  loading = 'lazy',
  onExhausted,
}: SmartImageProps) {
  const candidates = buildImageCandidates(url, mode, customProxy);
  const [idx, setIdx] = useState(0);
  /** App 内解析后的最终地址（blob: 或原样） */
  const [resolved, setResolved] = useState<string | null>(null);

  // 地址或加载方式变化时重置降级进度
  useEffect(() => setIdx(0), [url, mode, customProxy]);
  useEffect(() => {
    if (idx >= candidates.length) onExhausted?.();
    // 候选数组随 url/mode 变化，length 是充分的稳定信号
  }, [idx, candidates.length, onExhausted]);

  const candidate = candidates[idx];
  const needsResolve = isNativeApp() && !!candidate && isProxiedImage(candidate);

  useEffect(() => {
    if (!candidate) {
      setResolved(null);
      return;
    }
    if (!needsResolve) {
      setResolved(candidate);
      return;
    }
    let alive = true;
    setResolved(null);
    void resolveNativeImageSrc(candidate).then((value) => {
      if (!alive) return;
      if (value) setResolved(value);
      else setIdx((i) => i + 1); // 取图失败 → 继续下一个候选
    });
    return () => {
      alive = false;
    };
  }, [candidate, needsResolve]);

  if (!candidate) return null;
  const src = resolved ?? (needsResolve ? null : candidate);
  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
