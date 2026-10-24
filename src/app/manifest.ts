import type { MetadataRoute } from 'next';

// 静态导出（MOBILE_BUILD=1）要求元数据路由显式声明静态；对 Web 部署无副作用
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LibreTV - 免费在线视频搜索与观看平台',
    short_name: 'LibreTV',
    description: '免费在线视频搜索与观看平台',
    start_url: '/',
    display: 'standalone',
    background_color: '#111111',
    theme_color: '#0b101a',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
