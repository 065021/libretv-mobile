/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * `next/server` 的浏览器替身（仅移动端构建通过 webpack alias 生效）。
 * 只实现 Route Handler 实际用到的能力：NextResponse.json / new NextResponse(...)。
 */
export class NextResponse extends Response {
  cookies = {
    set: (_name: string, _value: string, _opts?: unknown) => undefined,
    get: (_name: string) => undefined as string | undefined,
    delete: (_name: string) => undefined,
  };

  static json(data: unknown, init?: ResponseInit): NextResponse {
    const headers = new Headers(init?.headers);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json; charset=utf-8');
    }
    const status = init?.status ?? 200;
    // 204/304 不允许带 body
    const body = status === 204 || status === 304 ? null : JSON.stringify(data);
    return new NextResponse(body, { ...init, headers });
  }

  static redirect(url: string | URL, status = 307): NextResponse {
    return new NextResponse(null, { status, headers: { location: String(url) } });
  }
}

/** Route Handler 的第二参数（动态段）在 App 内由本地分发器直接构造 */
export type NextRouteContext = { params: Promise<Record<string, string>> };
