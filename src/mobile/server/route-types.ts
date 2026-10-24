/** 本地路由表里每个模块的形态：与 App Router 的 Route Handler 导出保持一致 */
export interface RouteModule {
  GET?: (req: Request, ctx?: unknown) => Promise<Response> | Response;
  POST?: (req: Request, ctx?: unknown) => Promise<Response> | Response;
  DELETE?: (req: Request, ctx?: unknown) => Promise<Response> | Response;
  PUT?: (req: Request, ctx?: unknown) => Promise<Response> | Response;
}
