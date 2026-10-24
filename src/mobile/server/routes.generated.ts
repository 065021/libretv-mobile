/**
 * 移动端本地路由表（占位版本）。
 *
 * Web 构建下这份表是空的：浏览器里的 /api/* 由真正的服务端 Route Handler 处理。
 * 移动端构建（MOBILE_BUILD=1）前，scripts/mobile/build.mjs 会用真实实现重写本文件，
 * 把 src/app/_api/**\/route.ts 的 GET/POST/DELETE 直接挂到路径上，
 * 让 App 在 WebView 内部就地完成原来服务端的工作。
 */
import type { RouteModule } from './route-types';

export const ROUTE_TABLE: Record<string, RouteModule> = {};
