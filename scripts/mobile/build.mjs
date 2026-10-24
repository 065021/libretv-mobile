#!/usr/bin/env node
/**
 * 移动端打包脚本：把 Next.js 前端导出成静态资源，并同步进 Capacitor 工程。
 *
 * 为什么需要它：
 * - 静态导出（output: 'export'）不允许存在 Route Handler，而本项目全部业务逻辑
 *   都在 src/app/api 里。脚本构建前把该目录改名为 _api（App Router 中下划线目录
 *   不参与路由），同时生成一份路由表让 App 在 WebView 内直接调用这些 Handler；
 * - 构建结束（无论成功失败）都必须把目录名与路由表还原，否则 Web 部署会坏掉。
 *
 * 用法：
 *   node scripts/mobile/build.mjs            # 构建 + cap sync
 *   node scripts/mobile/build.mjs --no-sync  # 只构建静态资源
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const apiDir = path.join(root, 'src', 'app', 'api');
const hiddenApiDir = path.join(root, 'src', 'app', '_api');
const generatedFile = path.join(root, 'src', 'mobile', 'server', 'routes.generated.ts');
const skipSync = process.argv.includes('--no-sync');

const STUB = `/**
 * 移动端本地路由表（占位版本）。
 *
 * Web 构建下这份表是空的：浏览器里的 /api/* 由真正的服务端 Route Handler 处理。
 * 移动端构建（MOBILE_BUILD=1）前，scripts/mobile/build.mjs 会用真实实现重写本文件，
 * 把 src/app/_api/**\\/route.ts 的 GET/POST/DELETE 直接挂到路径上，
 * 让 App 在 WebView 内部就地完成原来服务端的工作。
 */
import type { RouteModule } from './route-types';

export const ROUTE_TABLE: Record<string, RouteModule> = {};
`;

/** 递归收集所有 route.ts，返回 App Router 的路径前缀（如 /status、/live/stream/[url]） */
function collectRoutes(dir, prefix = '') {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectRoutes(full, `${prefix}/${entry.name}`));
    } else if (entry.name === 'route.ts') {
      result.push(prefix);
    }
  }
  return result;
}

/** 把 [url] 这类动态段转成本地分发器使用的 :url */
function toRouteKey(prefix) {
  return `/api${prefix}`.replace(/\/\[([^\]]+)\]/g, '/:$1');
}

function generateRouteTable() {
  const prefixes = collectRoutes(hiddenApiDir).sort();
  if (prefixes.length === 0) {
    throw new Error('未在 src/app/_api 下找到任何 route.ts，构建中止');
  }

  const imports = prefixes
    .map((prefix, i) => `import * as r${i} from '@/app/_api${prefix}/route';`)
    .join('\n');
  const entries = prefixes
    .map((prefix, i) => `  '${toRouteKey(prefix)}': r${i} as unknown as RouteModule,`)
    .join('\n');

  const content = `/* eslint-disable */
/**
 * 本文件由 scripts/mobile/build.mjs 自动生成，请勿手工编辑。
 * 构建结束后脚本会把它还原成占位版本。
 */
import type { RouteModule } from './route-types';
${imports}

export const ROUTE_TABLE: Record<string, RouteModule> = {
${entries}
};
`;
  fs.writeFileSync(generatedFile, content, 'utf8');
  console.log(`[mobile] 已生成路由表：${prefixes.length} 个接口`);
}

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  try {
    if (fs.existsSync(hiddenApiDir)) {
      fs.renameSync(hiddenApiDir, apiDir);
      console.log('[mobile] 已还原 src/app/api');
    }
  } catch (err) {
    console.error('[mobile] 还原 src/app/api 失败，请手动把 src/app/_api 改回 src/app/api', err);
  }
  try {
    fs.writeFileSync(generatedFile, STUB, 'utf8');
  } catch (err) {
    console.error('[mobile] 还原路由表失败', err);
  }
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(signal, () => {
    restore();
    process.exit(1);
  });
}

try {
  if (fs.existsSync(hiddenApiDir)) {
    throw new Error('检测到上次构建残留的 src/app/_api，请先确认并删除后再重试');
  }
  if (!fs.existsSync(apiDir)) {
    throw new Error('未找到 src/app/api');
  }

  fs.renameSync(apiDir, hiddenApiDir);
  generateRouteTable();

  console.log('[mobile] 开始静态导出（output: export）...');
  execSync('npx next build', {
    stdio: 'inherit',
    env: {
      ...process.env,
      MOBILE_BUILD: '1',
      NODE_ENV: 'production',
    },
  });

  const outDir = path.join(root, 'out');
  if (!fs.existsSync(path.join(outDir, 'index.html'))) {
    throw new Error('静态导出未生成 out/index.html');
  }
  console.log('[mobile] 静态资源已输出到 out/');
} finally {
  restore();
}

if (!skipSync) {
  console.log('[mobile] 同步静态资源到原生工程（cap sync）...');
  execSync('npx cap sync', { stdio: 'inherit' });
  console.log('[mobile] 完成。Android: android/  iOS: ios/');
}
