/**
 * 本地路由分发器：把 WebView 内发出的 /api/* 请求直接交给原 Route Handler 执行。
 *
 * 路由表由构建脚本生成（见 routes.generated.ts），所以这里不需要知道具体有哪些接口。
 */
import { ROUTE_TABLE } from './routes.generated';
import type { RouteModule } from './route-types';

/** 旧版路径式代理：/api/proxy/<encodeURIComponent(url)>、/api/live/stream/<...> */
const PATH_STYLE_ROUTE = /^\/api\/(proxy|live\/stream)\/(.+)$/;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function dispatch(request: Request): Promise<Response> {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return jsonError('无效的请求地址', 400);
  }

  // 去掉尾部斜杠，兼容 /api/status/ 这类写法
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  let route: RouteModule | undefined = ROUTE_TABLE[pathname];
  let context: unknown;

  if (!route) {
    const dynamicMatch = PATH_STYLE_ROUTE.exec(pathname);
    if (dynamicMatch) {
      route = ROUTE_TABLE[`/api/${dynamicMatch[1]}/:url`];
      context = { params: Promise.resolve({ url: dynamicMatch[2] }) };
    }
  }

  if (!route) return jsonError(`接口不存在: ${pathname}`, 404);

  const handler =
    method === 'GET'
      ? route.GET
      : method === 'POST'
        ? route.POST
        : method === 'DELETE'
          ? route.DELETE
          : method === 'PUT'
            ? route.PUT
            : undefined;

  if (!handler) return jsonError(`不支持的方法: ${method}`, 405);

  try {
    return await handler(request, context);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : '请求处理失败', 500);
  }
}
