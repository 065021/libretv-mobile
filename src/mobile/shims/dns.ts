/* eslint-disable @typescript-eslint/no-unused-vars, import/no-anonymous-default-export */
/**
 * `node:dns/promises` 的 App 替身（仅移动端构建通过 webpack 替换生效）。
 * 供 ssrf.ts 的静态 import 使用；App 内不做内网地址拦截，因此恒返回公网地址。
 */
export interface LookupAddress {
  address: string;
  family: number;
}

export async function lookup(_hostname: string): Promise<LookupAddress> {
  return { address: '0.0.0.0', family: 4 };
}

export default { lookup };
