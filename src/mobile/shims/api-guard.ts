/**
 * API 鉴权守卫的 App 替身（仅移动端构建通过 webpack alias 生效）。
 * App 是单机自用形态，没有「部署者设置密码」的概念，因此永不放行拦截。
 */
import { NextResponse } from './next-server';

export function guardRequest(_req: Request): NextResponse | null {
  return null;
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
