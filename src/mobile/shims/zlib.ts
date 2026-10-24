/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * `node:zlib` 的 App 替身（仅移动端构建通过 webpack 替换生效）。
 *
 * 浏览器没有同步压缩能力，App 内一律走 DecompressionStream（见 src/lib/decompress.ts）。
 * 这里保留同名导出只为让 xmltv.ts 的静态 import 能被打包，实际不会被调用。
 */
export function gunzipSync(_input: unknown): never {
  throw new Error('App 内请使用 decodeMaybeGzip 解压');
}

export function gzipSync(_input: unknown): never {
  throw new Error('App 内不支持同步 gzip 压缩');
}

export function inflateSync(_input: unknown): never {
  throw new Error('App 内不支持同步 inflate');
}
