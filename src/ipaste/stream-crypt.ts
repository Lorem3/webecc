import { generateContentKey, aesGcmEncrypt, aesGcmDecrypt } from './common';
import { getSodium, openChaChaStreamPush, openChaChaStreamPull, STREAM_CHUNK_OVERHEAD } from './sodium';

/** 由构建配置注入：发布 50MB，dev/测试 16MB。 */
export const LARGE_FILE_THRESHOLD = __LARGE_FILE_THRESHOLD__;
export const STREAM_PLAIN_CHUNK = 1024 * 1024;
/** XChaCha20-Poly1305 IETF：整段一个 16 字节 tag（wasm 一次性 AEAD） */
export const STREAM_ABYTES = STREAM_CHUNK_OVERHEAD;
export const LAYER1_HEAD_LEN = 96;
export const LAYER2_ENC_HEAD_LEN = 12 + LAYER1_HEAD_LEN + 16; // 124
export const X_PREFIX = new Uint8Array([0x58, 0x2e]); // "X."
export const X_HEAD_TOTAL = 2 + LAYER2_ENC_HEAD_LEN; // 126

export function isLargeFile(file: File): boolean {
  return file.size > LARGE_FILE_THRESHOLD;
}

export function streamChunkCount(fileSize: number): number {
  return Math.max(1, Math.ceil(fileSize / STREAM_PLAIN_CHUNK));
}

/** 整段 AEAD：body = plaintext + 一个 16B tag（与一次性 encrypt 一致） */
export function streamBodyLength(fileSize: number): number {
  return fileSize + STREAM_ABYTES;
}

export function streamCipherTotalSize(fileSize: number): number {
  return X_HEAD_TOTAL + streamBodyLength(fileSize);
}

export function isXPrefix(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x58 && bytes[1] === 0x2e;
}

export async function openXEncHead(ec: any, privkey: string, pubkey: string, salt: string, prefixAndEncHead: Uint8Array): Promise<{
  streamKey: Uint8Array;
  ssHeader: Uint8Array;
}> {
  if (!isXPrefix(prefixAndEncHead) || prefixAndEncHead.length < X_HEAD_TOTAL) {
    throw new Error('Invalid X. header');
  }
  const encHead = prefixAndEncHead.subarray(2, X_HEAD_TOTAL);
  const contentKey = await generateContentKey(pubkey, salt);
  const head = new Uint8Array(await aesGcmDecrypt(encHead, contentKey));
  return ec.openEcdhStreamHead(privkey, head);
}

export type PushChunk = (plain: Uint8Array, isFinal: boolean) => Uint8Array;

export async function createXPush(ec: any, pubkey: string, salt: string): Promise<{
  prefixAndEncHead: Uint8Array;
  push: PushChunk;
}> {
  const na = await getSodium();
  const keys = await ec.deriveEcdhStreamKeys(pubkey);
  const ss = openChaChaStreamPush(na, keys.streamKey);
  const layer1 = await ec.assembleEcdhStreamHead(ss.header, keys.tmpPub, keys.macKey);
  const contentKey = await generateContentKey(pubkey, salt);
  const encHead = await aesGcmEncrypt(layer1, contentKey);
  const prefixAndEncHead = new Uint8Array(X_HEAD_TOTAL);
  prefixAndEncHead.set(X_PREFIX, 0);
  prefixAndEncHead.set(encHead, 2);
  keys.macKey.fill(0);
  return {
    prefixAndEncHead,
    push: (plain, isFinal) => ss.push(plain, isFinal),
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
}> {
  const na = await getSodium();
  const { streamKey, ssHeader } = await openXEncHead(ec, privkey, pubkey, salt, prefixAndEncHead);
  const ss = openChaChaStreamPull(na, streamKey, ssHeader);
  return {
    tagFinal: ss.tagFinal,
    update: (cipher) => ss.update(cipher),
    final: (tag) => ss.final(tag),
    pull: (cipher, isFinal = true) => {
      const r = ss.pull(cipher, isFinal);
      return { message: r.message, tag: r.tag, isFinal: r.isFinal };
    },
  };
}
