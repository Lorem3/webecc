type SodiumModule = {
  HEAPU8: Uint8Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _sodium_init(): number;
  _randombytes_buf(ptr: number, n: number): void;
  _crypto_aead_xchacha20poly1305_ietf_encrypt(
    c: number, clen_p: number, m: number, mlen: bigint, ad: number, adlen: bigint,
    nsec: number, npub: number, k: number
  ): number;
  _crypto_aead_xchacha20poly1305_ietf_decrypt(
    m: number, mlen_p: number, nsec: number, c: number, clen: bigint, ad: number, adlen: bigint,
    npub: number, k: number
  ): number;
  _crypto_aead_xchacha20poly1305_ietf_keybytes(): number;
  _crypto_aead_xchacha20poly1305_ietf_npubbytes(): number;
  _crypto_aead_xchacha20poly1305_ietf_abytes(): number;
};

let sodiumReady: Promise<SodiumModule> | null = null;

/** Resolve libsodium.js next to the page (build copies src/lib → www/). */
function sodiumJsUrl(): string {
  const base = (typeof document !== 'undefined' && document.baseURI)
    || (typeof location !== 'undefined' && location.href)
    || '';
  if (!base) throw new Error('libsodium.js: no base URL');
  return new URL('libsodium.js', base).href;
}

/** Load trimmed libsodium from lib/ (js + wasm via locateFile). */
export function getSodium(): Promise<SodiumModule> {
  if (!sodiumReady) {
    sodiumReady = (async () => {
      const jsUrl = sodiumJsUrl();
      const wasmUrl = new URL('libsodium.wasm', jsUrl).href;
      const { default: createModule } = await import(jsUrl);
      const m = await createModule({
        locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path),
      }) as SodiumModule;
      const rc = m._sodium_init();
      if (rc !== 0 && rc !== 1) throw new Error('sodium_init failed');
      return m;
    })();
  }
  return sodiumReady;
}

function readU32(m: SodiumModule, ptr: number): number {
  const h = m.HEAPU8;
  return (h[ptr] | (h[ptr + 1] << 8) | (h[ptr + 2] << 16) | (h[ptr + 3] << 24)) >>> 0;
}

export function randomBytes(m: SodiumModule, n: number): Uint8Array {
  const ptr = m._malloc(n);
  try {
    m._randombytes_buf(ptr, n);
    return m.HEAPU8.slice(ptr, ptr + n);
  } finally {
    m._free(ptr);
  }
}

/** XChaCha20-Poly1305 IETF via libsodium.wasm */
export const AEAD_KEYBYTES = 32;
export const AEAD_NPUBBYTES = 24;
export const AEAD_ABYTES = 16;
export const AEAD_EMPTY_AD = new Uint8Array(0);
export const STREAM_CHUNK_OVERHEAD = AEAD_ABYTES;

export function aeadEncrypt(
  m: SodiumModule, msg: Uint8Array, ad: Uint8Array, npub: Uint8Array, key: Uint8Array
): Uint8Array {
  if (npub.length !== AEAD_NPUBBYTES) throw new Error('bad xchacha nonce length');
  if (key.length !== AEAD_KEYBYTES) throw new Error('bad xchacha key length');
  const clenMax = msg.length + AEAD_ABYTES;
  const mPtr = m._malloc(Math.max(msg.length, 1));
  const adPtr = m._malloc(Math.max(ad.length, 1));
  const nPtr = m._malloc(AEAD_NPUBBYTES);
  const kPtr = m._malloc(AEAD_KEYBYTES);
  const cPtr = m._malloc(Math.max(clenMax, 1));
  const clenPtr = m._malloc(8);
  try {
    if (msg.length) m.HEAPU8.set(msg, mPtr);
    if (ad.length) m.HEAPU8.set(ad, adPtr);
    m.HEAPU8.set(npub, nPtr);
    m.HEAPU8.set(key, kPtr);
    const rc = m._crypto_aead_xchacha20poly1305_ietf_encrypt(
      cPtr, clenPtr, mPtr, BigInt(msg.length), adPtr, BigInt(ad.length), 0, nPtr, kPtr
    );
    if (rc !== 0) throw new Error('aead encrypt failed');
    return m.HEAPU8.slice(cPtr, cPtr + readU32(m, clenPtr));
  } finally {
    m._free(mPtr); m._free(adPtr); m._free(nPtr); m._free(kPtr); m._free(cPtr); m._free(clenPtr);
  }
}

export function aeadDecrypt(
  m: SodiumModule, cipher: Uint8Array, ad: Uint8Array, npub: Uint8Array, key: Uint8Array
): Uint8Array {
  if (npub.length !== AEAD_NPUBBYTES) throw new Error('bad xchacha nonce length');
  if (key.length !== AEAD_KEYBYTES) throw new Error('bad xchacha key length');
  if (cipher.length < AEAD_ABYTES) throw new Error('cipher too short');
  const mPtr = m._malloc(Math.max(cipher.length - AEAD_ABYTES, 1));
  const adPtr = m._malloc(Math.max(ad.length, 1));
  const nPtr = m._malloc(AEAD_NPUBBYTES);
  const kPtr = m._malloc(AEAD_KEYBYTES);
  const cPtr = m._malloc(Math.max(cipher.length, 1));
  const mlenPtr = m._malloc(8);
  try {
    m.HEAPU8.set(cipher, cPtr);
    if (ad.length) m.HEAPU8.set(ad, adPtr);
    m.HEAPU8.set(npub, nPtr);
    m.HEAPU8.set(key, kPtr);
    const rc = m._crypto_aead_xchacha20poly1305_ietf_decrypt(
      mPtr, mlenPtr, 0, cPtr, BigInt(cipher.length), adPtr, BigInt(ad.length), nPtr, kPtr
    );
    if (rc !== 0) throw new Error('Stream decrypt failed');
    return m.HEAPU8.slice(mPtr, mPtr + readU32(m, mlenPtr));
  } finally {
    m._free(mPtr); m._free(adPtr); m._free(nPtr); m._free(kPtr); m._free(cPtr); m._free(mlenPtr);
  }
}

function concatParts(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export type ChaChaStreamPush = {
  header: Uint8Array;
  abytes: number;
  tagFinal: number;
  update: (plain: Uint8Array) => Uint8Array;
  final: () => Uint8Array;
  /** 非末块返回空；末块用 wasm 一次性 encrypt，结果与 aeadEncrypt 一致 */
  push: (plain: Uint8Array, isFinal: boolean) => Uint8Array;
};

export type ChaChaStreamPull = {
  abytes: number;
  tagFinal: number;
  update: (cipher: Uint8Array) => Uint8Array;
  final: (tag: Uint8Array) => Uint8Array;
  pull: (cipher: Uint8Array, isFinal?: boolean) => { message: Uint8Array; tag: number; isFinal: boolean };
};

/**
 * 流式 API：分块收集，最终调用 libsodium.wasm 的
 * crypto_aead_xchacha20poly1305_ietf_*（与一次性加解密结果一致）。
 */
export function openChaChaStreamPush(
  m: SodiumModule, key: Uint8Array, iv?: Uint8Array
): ChaChaStreamPush {
  if (key.length !== AEAD_KEYBYTES) throw new Error('bad xchacha key length');
  const header = iv && iv.length === AEAD_NPUBBYTES
    ? iv.slice()
    : randomBytes(m, AEAD_NPUBBYTES);
  const parts: Uint8Array[] = [];
  let total = 0;
  let done = false;
  let finished: Uint8Array | null = null;

  const runEncrypt = () => {
    if (finished) return finished;
    const plain = concatParts(parts, total);
    parts.length = 0;
    total = 0;
    finished = aeadEncrypt(m, plain, AEAD_EMPTY_AD, header, key);
    done = true;
    return finished;
  };

  return {
    header,
    abytes: AEAD_ABYTES,
    tagFinal: 1,
    update: (plain) => {
      if (done) throw new Error('aead stream finished');
      if (plain.length) {
        parts.push(plain.slice());
        total += plain.length;
      }
      return new Uint8Array(0);
    },
    final: () => {
      const full = runEncrypt();
      return full.subarray(full.length - AEAD_ABYTES);
    },
    push: (plain, isFinal) => {
      if (done) throw new Error('aead stream finished');
      if (plain.length) {
        parts.push(plain.slice());
        total += plain.length;
      }
      if (!isFinal) return new Uint8Array(0);
      return runEncrypt();
    },
  };
}

export function openChaChaStreamPull(
  m: SodiumModule, key: Uint8Array, header: Uint8Array
): ChaChaStreamPull {
  if (key.length !== AEAD_KEYBYTES) throw new Error('bad xchacha key length');
  if (header.length !== AEAD_NPUBBYTES) throw new Error('bad xchacha iv length');
  const parts: Uint8Array[] = [];
  let total = 0;
  let done = false;
  let plainOut: Uint8Array | null = null;

  const runDecrypt = (cipher: Uint8Array) => {
    if (done && plainOut) return plainOut;
    plainOut = aeadDecrypt(m, cipher, AEAD_EMPTY_AD, header, key);
    done = true;
    parts.length = 0;
    total = 0;
    return plainOut;
  };

  return {
    abytes: AEAD_ABYTES,
    tagFinal: 1,
    update: (cipher) => {
      if (done) throw new Error('aead stream finished');
      if (cipher.length) {
        parts.push(cipher.slice());
        total += cipher.length;
      }
      return new Uint8Array(0);
    },
    final: (tag) => {
      if (done) throw new Error('aead stream finished');
      if (tag.length !== AEAD_ABYTES) throw new Error('bad tag length');
      const body = concatParts(parts, total);
      const full = new Uint8Array(body.length + tag.length);
      full.set(body, 0);
      full.set(tag, body.length);
      return runDecrypt(full);
    },
    pull: (cipher, isFinal = true) => {
      if (done) throw new Error('aead stream finished');
      if (!isFinal) {
        if (cipher.length) {
          parts.push(cipher.slice());
          total += cipher.length;
        }
        return { message: new Uint8Array(0), tag: 0, isFinal: false };
      }
      if (total > 0) {
        const prev = concatParts(parts, total);
        const full = new Uint8Array(prev.length + cipher.length);
        full.set(prev, 0);
        full.set(cipher, prev.length);
        parts.length = 0;
        total = 0;
        const message = runDecrypt(full);
        return { message, tag: 1, isFinal: true };
      }
      const message = runDecrypt(cipher);
      return { message, tag: 1, isFinal: true };
    },
  };
}

export const openSecretStreamPush = openChaChaStreamPush;
export const openSecretStreamPull = openChaChaStreamPull;
