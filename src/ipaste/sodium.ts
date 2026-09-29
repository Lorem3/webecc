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
  _crypto_aead_xchacha20poly1305_ietf_statebytes(): number;
  /** init(state, ad, adlen, npub, key) */
  _crypto_aead_xchacha20poly1305_ietf_encrypt_init(
    state: number, ad: number, adlen: bigint, npub: number, k: number
  ): number;
  /** update(state, c, m, mlen) — |c|==|m| */
  _crypto_aead_xchacha20poly1305_ietf_encrypt_update(
    state: number, c: number, m: number, mlen: bigint
  ): number;
  /** final(state, tag) — 写入 abytes */
  _crypto_aead_xchacha20poly1305_ietf_encrypt_final(state: number, tag: number): number;
  _crypto_aead_xchacha20poly1305_ietf_decrypt_init(
    state: number, ad: number, adlen: bigint, npub: number, k: number
  ): number;
  _crypto_aead_xchacha20poly1305_ietf_decrypt_update(
    state: number, m: number, c: number, clen: bigint
  ): number;
  _crypto_aead_xchacha20poly1305_ietf_decrypt_final(state: number, tag: number): number;
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

/** XChaCha20-Poly1305 IETF（一次性与增量流式密文一致） */
export const AEAD_KEYBYTES = 32;
export const AEAD_NPUBBYTES = 24;
export const AEAD_ABYTES = 16;
export const AEAD_EMPTY_AD = new Uint8Array(0);
/** 流式 body 末尾一个 16B tag（与一次性 encrypt 一致） */
export const STREAM_ABYTES = AEAD_ABYTES;
export const STREAM_CHUNK_OVERHEAD = STREAM_ABYTES;

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

export type ChaChaStreamPush = {
  header: Uint8Array;
  abytes: number;
  tagFinal: number;
  /** 立即 encrypt_update；返回与明文等长的密文 */
  update: (plain: Uint8Array) => Uint8Array;
  /** encrypt_final，返回 16B tag */
  final: () => Uint8Array;
  /**
   * 增量流式：每块立即出密文（与一次性 encrypt 拼接结果一致）。
   * isFinal 时在末尾附加 16B tag。
   */
  push: (plain: Uint8Array, isFinal: boolean) => Uint8Array;
};

export type ChaChaStreamPull = {
  abytes: number;
  tagFinal: number;
  /** 立即 decrypt_update；|m|==|c| */
  update: (cipher: Uint8Array) => Uint8Array;
  /** decrypt_final(tag) */
  final: (tag: Uint8Array) => Uint8Array;
  /**
   * isFinal=false：整段视为密文主体，decrypt_update。
   * isFinal=true：末尾 abytes 为 tag，前面 decrypt_update 后 final。
   */
  pull: (cipher: Uint8Array, isFinal?: boolean) => { message: Uint8Array; tag: number; isFinal: boolean };
};

/**
 * 增量 AEAD 流式 API（encrypt_init/update/final）。
 * 密文 = 各块 update 输出 ‖ final tag，与一次性 crypto_aead_*_encrypt 完全一致。
 */
export function openChaChaStreamPush(
  m: SodiumModule, key: Uint8Array, iv?: Uint8Array
): ChaChaStreamPush {
  if (key.length !== AEAD_KEYBYTES) throw new Error('bad xchacha key length');
  const stateBytes = m._crypto_aead_xchacha20poly1305_ietf_statebytes();
  const abytes = m._crypto_aead_xchacha20poly1305_ietf_abytes();
  const header = iv && iv.length === AEAD_NPUBBYTES
    ? iv.slice()
    : randomBytes(m, AEAD_NPUBBYTES);

  const statePtr = m._malloc(stateBytes);
  const nPtr = m._malloc(AEAD_NPUBBYTES);
  const kPtr = m._malloc(AEAD_KEYBYTES);
  let done = false;
  let stateAlive = true;

  try {
    m.HEAPU8.set(header, nPtr);
    m.HEAPU8.set(key, kPtr);
    const rc = m._crypto_aead_xchacha20poly1305_ietf_encrypt_init(statePtr, 0, 0n, nPtr, kPtr);
    if (rc !== 0) {
      m._free(statePtr);
      throw new Error('aead encrypt_init failed');
    }
  } finally {
    m._free(nPtr);
    m._free(kPtr);
  }

  const freeState = () => {
    if (stateAlive) {
      stateAlive = false;
      m._free(statePtr);
    }
  };

  const updateOne = (plain: Uint8Array): Uint8Array => {
    if (done) throw new Error('aead stream finished');
    if (!plain.length) return new Uint8Array(0);
    const mPtr = m._malloc(plain.length);
    const cPtr = m._malloc(plain.length);
    try {
      m.HEAPU8.set(plain, mPtr);
      const rc = m._crypto_aead_xchacha20poly1305_ietf_encrypt_update(
        statePtr, cPtr, mPtr, BigInt(plain.length)
      );
      if (rc !== 0) throw new Error('aead encrypt_update failed');
      return m.HEAPU8.slice(cPtr, cPtr + plain.length);
    } finally {
      m._free(mPtr);
      m._free(cPtr);
    }
  };

  const finalTag = (): Uint8Array => {
    if (done) throw new Error('aead stream finished');
    const tagPtr = m._malloc(abytes);
    try {
      const rc = m._crypto_aead_xchacha20poly1305_ietf_encrypt_final(statePtr, tagPtr);
      if (rc !== 0) throw new Error('aead encrypt_final failed');
      done = true;
      freeState();
      return m.HEAPU8.slice(tagPtr, tagPtr + abytes);
    } catch (e) {
      if (!done) {
        done = true;
        freeState();
      }
      throw e;
    } finally {
      m._free(tagPtr);
    }
  };

  return {
    header,
    abytes,
    tagFinal: 1,
    update: updateOne,
    final: finalTag,
    push: (plain, isFinal) => {
      const body = updateOne(plain);
      if (!isFinal) return body;
      const tag = finalTag();
      if (!body.length) return tag;
      const out = new Uint8Array(body.length + tag.length);
      out.set(body, 0);
      out.set(tag, body.length);
      return out;
    },
  };
}

export function openChaChaStreamPull(
  m: SodiumModule, key: Uint8Array, header: Uint8Array
): ChaChaStreamPull {
  if (key.length !== AEAD_KEYBYTES) throw new Error('bad xchacha key length');
  if (header.length !== AEAD_NPUBBYTES) throw new Error('bad xchacha iv length');
  const stateBytes = m._crypto_aead_xchacha20poly1305_ietf_statebytes();
  const abytes = m._crypto_aead_xchacha20poly1305_ietf_abytes();

  const statePtr = m._malloc(stateBytes);
  const nPtr = m._malloc(AEAD_NPUBBYTES);
  const kPtr = m._malloc(AEAD_KEYBYTES);
  let done = false;
  let stateAlive = true;

  try {
    m.HEAPU8.set(header, nPtr);
    m.HEAPU8.set(key, kPtr);
    const rc = m._crypto_aead_xchacha20poly1305_ietf_decrypt_init(statePtr, 0, 0n, nPtr, kPtr);
    if (rc !== 0) {
      m._free(statePtr);
      throw new Error('aead decrypt_init failed');
    }
  } finally {
    m._free(nPtr);
    m._free(kPtr);
  }

  const freeState = () => {
    if (stateAlive) {
      stateAlive = false;
      m._free(statePtr);
    }
  };

  const updateOne = (cipher: Uint8Array): Uint8Array => {
    if (done) throw new Error('aead stream finished');
    if (!cipher.length) return new Uint8Array(0);
    const cPtr = m._malloc(cipher.length);
    const mPtr = m._malloc(cipher.length);
    try {
      m.HEAPU8.set(cipher, cPtr);
      const rc = m._crypto_aead_xchacha20poly1305_ietf_decrypt_update(
        statePtr, mPtr, cPtr, BigInt(cipher.length)
      );
      if (rc !== 0) throw new Error('Stream decrypt failed');
      return m.HEAPU8.slice(mPtr, mPtr + cipher.length);
    } finally {
      m._free(cPtr);
      m._free(mPtr);
    }
  };

  const finalOne = (tag: Uint8Array): Uint8Array => {
    if (done) throw new Error('aead stream finished');
    if (tag.length !== abytes) throw new Error('bad tag length');
    const tagPtr = m._malloc(abytes);
    try {
      m.HEAPU8.set(tag, tagPtr);
      const rc = m._crypto_aead_xchacha20poly1305_ietf_decrypt_final(statePtr, tagPtr);
      if (rc !== 0) throw new Error('Stream decrypt failed');
      done = true;
      freeState();
      return new Uint8Array(0);
    } catch (e) {
      if (!done) {
        done = true;
        freeState();
      }
      throw e;
    } finally {
      m._free(tagPtr);
    }
  };

  return {
    abytes,
    tagFinal: 1,
    update: updateOne,
    final: finalOne,
    pull: (cipher, isFinal = true) => {
      if (!isFinal) {
        const message = updateOne(cipher);
        return { message, tag: 0, isFinal: false };
      }
      if (cipher.length < abytes) throw new Error('cipher too short');
      const body = cipher.subarray(0, cipher.length - abytes);
      const tag = cipher.subarray(cipher.length - abytes);
      const message = updateOne(body);
      finalOne(tag);
      return { message, tag: 1, isFinal: true };
    },
  };
}

export const openSecretStreamPush = openChaChaStreamPush;
export const openSecretStreamPull = openChaChaStreamPull;
