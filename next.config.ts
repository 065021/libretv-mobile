import type { NextConfig } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import { webpack } from 'next/dist/compiled/webpack/webpack';

/** 版本号以 package.json 为单一来源，构建时注入 process.env.APP_VERSION（/api/status 使用） */
function readAppVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * 移动端构建（MOBILE_BUILD=1）说明：
 *
 * 1. `output: 'export'` 产出纯静态资源，由 Capacitor 打进 APK / IPA；
 * 2. 静态导出不支持 Route Handler，构建脚本会把 `src/app/api` 临时改名为
 *    `src/app/_api`（App Router 中下划线前缀目录不参与路由），
 *    并重写 `src/mobile/server/routes.generated.ts` 指向真实实现——
 *    App 内由本地分发器在 WebView 里直接执行这些 Handler；
 * 3. 把 Node 专属依赖替换成浏览器替身（鉴权 / SSRF / NextResponse / 上游请求），
 *    只对 src 下的模块生效，不污染 Next 自身的内部引用；
 * 4. 部署期环境变量统一按「未配置」注入，走代码里的默认值。
 */
const isMobile = process.env.MOBILE_BUILD === '1';

const SRC_DIR = path.join(process.cwd(), 'src');
const MOBILE_DIR = path.join(SRC_DIR, 'mobile');

/** 移动端构建：把服务端专属模块换成浏览器可执行的替身 */
const MOBILE_MODULE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/^next\/server$/, path.join(MOBILE_DIR, 'shims', 'next-server.ts')],
  [/^@\/lib\/ssrf$/, path.join(MOBILE_DIR, 'shims', 'ssrf.ts')],
  [/^@\/lib\/api-guard$/, path.join(MOBILE_DIR, 'shims', 'api-guard.ts')],
  [/^@\/lib\/auth$/, path.join(MOBILE_DIR, 'shims', 'auth.ts')],
  [/^@\/lib\/fetch-utils$/, path.join(MOBILE_DIR, 'server', 'fetch-utils.ts')],
  [/^node:zlib$/, path.join(MOBILE_DIR, 'shims', 'zlib.ts')],
  [/^node:crypto$/, path.join(MOBILE_DIR, 'shims', 'crypto.ts')],
  [/^node:dns\/promises$/, path.join(MOBILE_DIR, 'shims', 'dns.ts')],
];

/**
 * App 没有部署环境变量，预置数据改为构建期读取工程根目录的 JSON 文件：
 * - mobile-sources.json       点播采集站（同 DEFAULT_SOURCES 格式）
 * - mobile-live-sources.json  直播源（同 DEFAULT_LIVE_SOURCES 格式）
 * - mobile-subscriptions.json 订阅链接（同 DEFAULT_SUBSCRIPTIONS 格式）
 * 文件不存在时留空，行为与「Web 版未配置这些变量」一致。
 */
function readOptionalJson(fileName: string): string {
  try {
    const file = path.join(process.cwd(), fileName);
    if (!fs.existsSync(file)) return '';
    const raw = fs.readFileSync(file, 'utf8');
    JSON.parse(raw); // 格式不对直接当没配，避免把坏数据打进包里
    return raw.replace(/\s+/g, ' ').trim();
  } catch {
    console.warn(`[LibreTV] ${fileName} 解析失败，已忽略`);
    return '';
  }
}

/** 部署期才由环境变量决定的行为，在 App 内统一按「未配置」处理（空串即走默认值） */
const MOBILE_ENV: Record<string, string> = {
  MOBILE_BUILD: '1',
  APP_VERSION: readAppVersion(),
  REQUEST_TIMEOUT: '',
  MAX_RETRIES: '',
  USER_AGENT: '',
  SEARCH_MAX_PAGES: '',
  SEARCH_SOURCE_TIMEOUT_MS: '',
  LIVE_ALLOW_PRIVATE: '',
  FALLBACK_CORS_PROXY: '',
  PROXY_SECRET: '',
  PASSWORD: '',
  COOKIE_SECURE: '',
  DEFAULT_SOURCES: readOptionalJson('mobile-sources.json'),
  DEFAULT_LIVE_SOURCES: readOptionalJson('mobile-live-sources.json'),
  DEFAULT_SUBSCRIPTIONS: readOptionalJson('mobile-subscriptions.json'),
  DEFAULT_RECOMMEND_SOURCE: '',
  DEFAULT_IMAGE_MODE: '',
};

const nextConfig: NextConfig = {
  // standalone 输出仅供 Docker 镜像构建使用（DOCKER_BUILD=1）；
  // 本地 next start 在 standalone 模式下不受支持，故按环境切换
  output: isMobile ? 'export' : process.env.DOCKER_BUILD === '1' ? 'standalone' : undefined,
  reactStrictMode: true,
  env: isMobile ? MOBILE_ENV : { MOBILE_BUILD: '0', APP_VERSION: readAppVersion() },
  // 采集站/豆瓣等上游地址在运行时由用户配置，构建期无法枚举，关闭图片优化改用 <img>
  images: { unoptimized: true },
  // 静态导出：目录形式输出（/watch/index.html），WebView 本地资源服务器可直接命中
  trailingSlash: isMobile,
  webpack: isMobile
    ? (config) => {
        config.plugins = config.plugins || [];
        for (const [pattern, target] of MOBILE_MODULE_REPLACEMENTS) {
          config.plugins.push(
            new webpack.NormalModuleReplacementPlugin(pattern, (resource: { request: string; contextInfo?: { issuer?: string } }) => {
              const issuer = resource.contextInfo?.issuer || '';
              // issuer 可能是相对路径（./src/lib/x.ts），统一解析成绝对路径再判断，
              // 只替换业务代码里的引用，避免影响 Next 运行时自身
              if (!issuer || !path.resolve(process.cwd(), issuer).startsWith(SRC_DIR)) return;
              resource.request = target;
            })
          );
        }
        return config;
      }
    : undefined,
};

export default nextConfig;
