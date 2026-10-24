/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * SSRF 校验的 App 替身（仅移动端构建通过 webpack alias 生效）。
 *
 * 原逻辑用于保护「服务器」不被用户配置的地址带去访问内网/云元数据地址。
 * App 内请求由用户自己的设备直接发出，不存在这种越权面，
 * 且不少用户会用局域网自建源（NAS/路由器上的 IPTV），一律放行更符合预期。
 */
export type UpstreamVerdict = { ok: true } | { ok: false; reason: string };

export function isPrivateIP(_ip: string): boolean {
  return false;
}

export function isValidProxyUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function isBlockedByDNS(_urlString: string): Promise<boolean> {
  return false;
}

export async function checkUpstreamAllowed(_urlString: string): Promise<UpstreamVerdict> {
  return { ok: true };
}

export function allowLivePrivate(): boolean {
  return true;
}

export async function checkLiveUrlAllowed(_urlString: string): Promise<UpstreamVerdict> {
  return { ok: true };
}
