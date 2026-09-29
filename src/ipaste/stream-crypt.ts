import { generateContentKey, aesGcmEncrypt, aesGcmDecrypt } from './common';
import { getSodium, openChaChaStreamPush, openChaChaStreamPull, STREAM_CHUNK_OVERHEAD } from './sodium';

/** 由构建配置注入：超过 8MB 走 X. 流式（debug / release 相同）。 */
export const LARGE_FILE_THRESHOLD = __LARGE_FILE_THRESHOLD__;
export const STREAM_PLAIN_CHUNK = 1024 * 1024;
/** 增量 AEAD：body = 明文密文（等长）+ 末尾 16B tag（与一次性 encrypt 一致） */
export const STREAM_ABYTES = STREAM_CHUNK_OVERHEAD;
export const LAYER1_HEAD_LEN = 96;
export const LAYER2_ENC_HEAD_LEN = 12 + LAYER1_HEAD_LEN + 16; // 124
export const X_PREFIX = new Uint8Array([0x58, 0x2e]); // "X."
export const X_HEAD_TOTAL = 2 + LAYER2_ENC_HEAD_LEN; // 126

const TEXT_EXT_RE =
  /\.(txt|md|csv|tsv|json|xml|html?|css|js|mjs|ts|tsx|jsx|svg|log|yml|yaml|toml|ini|cfg|conf)$/;

/** 文本 MIME（或扩展名兜底）→ X. 流式先 gzip，Layer1=0x0E */
export function isTextMime(type: string, name?: string): boolean {
  const t = (type || '').toLowerCase();
  if (t.startsWith('text/')) return true;
  if (t === 'application/json' || t === 'application/xml' || t === 'application/javascript') return true;
  if (t.endsWith('+json') || t.endsWith('+xml')) return true;
  const n = (name || '').toLowerCase();
  return TEXT_EXT_RE.test(n);
}

export function isLargeFile(file: File): boolean {
  return file.size > LARGE_FILE_THRESHOLD;
}

export function streamChunkCount(fileSize: number): number {
  return Math.max(1, Math.ceil(fileSize / STREAM_PLAIN_CHUNK));
}

/** body = plaintext + 一个 16B tag（与一次性 encrypt 一致） */
export function streamBodyLength(fileSize: number): number {
  return fileSize + STREAM_ABYTES;
}

export function streamCipherTotalSize(fileSize: number): number {
  return X_HEAD_TOTAL + streamBodyLength(fileSize);
}

export function isXPrefix(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x58 && bytes[1] === 0x2e;
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** 增量 gzip：边写边读 CompressionStream 输出 */
export function createGzipSink(): {
  write(chunk: Uint8Array): Promise<Uint8Array>;
  close(): Promise<Uint8Array>;
} {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();
  const pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let readError: unknown = null;

  const pump = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value !== undefined && value.length) {
          pending.push(value);
          pendingBytes += value.length;
        }
      }
    } catch (e) {
      readError = e;
    }
  })();

  const takePending = (): Uint8Array => {
    if (pendingBytes === 0) return new Uint8Array(0);
    const out = concatChunks(pending, pendingBytes);
    pending.length = 0;
    pendingBytes = 0;
    return out;
  };

  return {
    async write(chunk: Uint8Array): Promise<Uint8Array> {
      if (readError) throw readError;
      if (chunk.length) await writer.write(chunk);
      await Promise.resolve();
      return takePending();
    },
    async close(): Promise<Uint8Array> {
      if (readError) throw readError;
      await writer.close();
      await pump;
      if (readError) throw readError;
      return takePending();
    },
  };
}

/** gzip → Blob（不解成第二份 Uint8Array，供下载） */
export async function ungzipToBlob(input: Uint8Array): Promise<Blob> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(input);
      controller.close();
    },
  }).pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).blob();
}

/** 整段 ungzip（测试等需要字节数组时使用） */
export async function ungzipBytes(input: Uint8Array): Promise<Uint8Array> {
  const blob = await ungzipToBlob(input);
  return new Uint8Array(await blob.arrayBuffer());
}

export async function openXEncHead(ec: any, privkey: string, pubkey: string, salt: string, prefixAndEncHead: Uint8Array): Promise<{
  streamKey: Uint8Array;
  ssHeader: Uint8Array;
  isZip: boolean;
}> {
  if (!isXPrefix(prefixAndEncHead) || prefixAndEncHead.length < X_HEAD_TOTAL) {
    throw new Error('Invalid X. header');
  }
  const encHead = prefixAndEncHead.subarray(2, X_HEAD_TOTAL);
  const contentKey = await generateContentKey(pubkey, salt);
  const head = new Uint8Array(await aesGcmDecrypt(encHead, contentKey));
  return ec.openEcdhStreamHead(privkey, head);
}

export type PushChunk = (plain: Uint8Array, isFinal: boolean) => Promise<Uint8Array>;

export async function createXPush(ec: any, pubkey: string, salt: string, zipFirst = false): Promise<{
  prefixAndEncHead: Uint8Array;
  push: PushChunk;
  zipFirst: boolean;
}> {
  const na = await getSodium();
  const keys = await ec.deriveEcdhStreamKeys(pubkey);
  const ss = openChaChaStreamPush(na, keys.streamKey);
  const layer1 = await ec.assembleEcdhStreamHead(ss.header, keys.tmpPub, keys.macKey, zipFirst);
  const contentKey = await generateContentKey(pubkey, salt);
  const encHead = await aesGcmEncrypt(layer1, contentKey);
  const prefixAndEncHead = new Uint8Array(X_HEAD_TOTAL);
  prefixAndEncHead.set(X_PREFIX, 0);
  prefixAndEncHead.set(encHead, 2);
  keys.macKey.fill(0);

  if (!zipFirst) {
    return {
      prefixAndEncHead,
      zipFirst: false,
      push: async (plain, isFinal) => ss.push(plain, isFinal),
    };
  }

  const gzip = createGzipSink();
  return {
    prefixAndEncHead,
    zipFirst: true,
    push: async (plain, isFinal) => {
      if (!isFinal) {
        const compressed = await gzip.write(plain);
        if (!compressed.length) return new Uint8Array(0);
        return ss.push(compressed, false);
      }
      const parts: Uint8Array[] = [];
      let total = 0;
      if (plain.length) {
        const mid = await gzip.write(plain);
        if (mid.length) {
          const c = ss.push(mid, false);
          if (c.length) { parts.push(c); total += c.length; }
        }
      }
      const last = await gzip.close();
      const c = ss.push(last, true);
      parts.push(c);
      total += c.length;
      return concatChunks(parts, total);
    },
  };
}

export type PullChunk = (cipher: Uint8Array, isFinal?: boolean) => {
  message: Uint8Array; tag: number; isFinal: boolean;
};

export async function createXPull(ec: any, privkey: string, pubkey: string, salt: string, prefixAndEncHead: Uint8Array): Promise<{
  pull: PullChunk;
  tagFinal: number;
  update: (cipher: Uint8Array) => Uint8Array;
  final: (tag: Uint8Array) => Uint8Array;
  isZip: boolean;
  abytes: number;
}> {
  const na = await getSodium();
  const { streamKey, ssHeader, isZip } = await openXEncHead(ec, privkey, pubkey, salt, prefixAndEncHead);
  const ss = openChaChaStreamPull(na, streamKey, ssHeader);
  return {
    isZip,
    abytes: ss.abytes,
    tagFinal: ss.tagFinal,
    update: (cipher) => ss.update(cipher),
    final: (tag) => ss.final(tag),
    pull: (cipher, isFinal = true) => {
      const r = ss.pull(cipher, isFinal);
      return { message: r.message, tag: r.tag, isFinal: r.isFinal };
    },
  };
}
