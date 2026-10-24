/* eslint-disable @typescript-eslint/no-unused-vars, import/no-anonymous-default-export */
/**
 * `node:crypto` 的 App 替身（仅移动端构建通过 webpack 替换生效）。
 *
 * 唯一用处是 codec-parse 里解密 AES-128 分片前缀来探测画质。浏览器没有同步解密 API，
 * 这里返回一个「空解密器」：调用方拿到空结果后按「测不出」处理，
 * 画质徽章显示为未知，不影响播放本身（播放由播放器实测分辨率兜底）。
 */
export function createDecipheriv(_algorithm: string, _key: Uint8Array, _iv: Uint8Array) {
  return {
    setAutoPadding(_padding?: boolean) {
      /* noop */
    },
    update(_data: Uint8Array): Uint8Array {
      return new Uint8Array(0);
    },
    final(): Uint8Array {
      return new Uint8Array(0);
    },
  };
}

export function createHash(_algorithm: string) {
  return {
    update(_data: unknown) {
      return this;
    },
    digest(): Uint8Array {
      return new Uint8Array(0);
    },
  };
}

export default { createDecipheriv, createHash };
