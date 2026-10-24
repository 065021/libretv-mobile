/**
 * 跨运行时的 gzip 解码：服务端（Node 18+）与 App（WebView）都内置 DecompressionStream，
 * 因此不需要引入 node:zlib，静态导出的客户端 bundle 里也不会残留 Node 依赖。
 */

/** 是否为 gzip 字节流（1f 8b 魔数） */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * 文本解码，自动识别 gzip。
 * EPG（XMLTV）常见 .xml.gz，fetch 不会自动解压，需要在这里处理。
 */
export async function decodeMaybeGzip(bytes: Uint8Array): Promise<string> {
  if (!isGzip(bytes)) return new TextDecoder('utf-8').decode(bytes);

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前运行环境不支持 gzip 解压');
  }
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** UTF-8 字节数（替代 Buffer.byteLength，浏览器可用） */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
