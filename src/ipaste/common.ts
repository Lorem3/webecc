import { jsMessages as messages } from '@i18n/js-messages';
import { htmlMessages } from '@i18n/html-messages';

// --- Constants ---

export const KDF_V2 = {
  ver: "2.0",
  hash: "SHA-512",
  iterations: 210000,
} as const;

export const WEB_PRIVATE = "yNmVrcoS5D4xMTvjAPSkZe57HZqPZoIUxznm+SqWKFo=";
export const WEB_PUBLIC = "dTj41nmwoLcguLpM9AntyKgg67xx6K4UAxc27CLIcFw=";

// --- Types ---

export interface InputData {
  pubkey: string;
  salt?: string;
  ver?: string;
  kdfHash?: string;
  kdfIterations?: number;
  type?: 'phrase' | 'pubkey';
  private?: string;
}

export interface AppState {
  G_Input: InputData | undefined;
  currentSalt: string | undefined;
}

export function createAppState(): AppState {
  return { G_Input: undefined, currentSalt: undefined };
}

// --- UI Helpers ---

export function openUrl(url: string) {
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    location.href = url;
  } else {
    window.open(url, "_blank");
  }
}

export function getPlainText() {
  let input = document.getElementById("plaintext") as HTMLTextAreaElement;
  return input?.value;
}

export function getResultText() {
  let input = document.getElementById("resultText") as HTMLTextAreaElement;
  return input?.value;
}

export function setPlainText(str: string) {
  let input = document.getElementById("plaintext") as HTMLTextAreaElement;
  if (input) input.value = str;
}

export function setSyncStatus(str: string) {
  const el = document.getElementById("syncStatus");
  if (el) el.textContent = str;
}

export function setResultText(str: string) {
  const el = document.getElementById("resultText") as HTMLTextAreaElement;
  const copyBtn = document.getElementById("resultCopyBtn");
  if (el) {
    el.value = str;
  }
  if (copyBtn) copyBtn.style.display = str ? '' : 'none';
}

export function setErrMsg(str: string) {
  console.log(str);
  alert(str);
}

export function maskKey(key: string): string {
  if (key.length <= 6) return key;
  return key.slice(0, 3) + '*'.repeat(key.length - 6) + key.slice(-3);
}

export function showSaltInfo(salt: string, state: AppState) {
  state.currentSalt = salt;
  const row = document.getElementById("saltRow");
  const el = document.getElementById("salt");
  if (!row || !el) return;
  el.textContent = salt;
  row.style.display = "flex";
}

export function showMaskedPrivkey(privkey: string) {
  const row = document.getElementById("bmPrivkeyRow");
  const el = document.getElementById("bmPrivkey");
  if (!row || !el) return;
  el.textContent = maskKey(privkey);
  row.style.display = "flex";
}

// --- Crypto ---

export function generateRandomSalt(ec: any): string {
  const bytes = crypto.getRandomValues(new Uint8Array(33));
  return ec.base64Encode(bytes);
}

export async function pbkdf2(
  phrase: string,
  saltStr: string,
  ec: any,
  kdf?: { hash: string; iterations: number }
) {
  let substl = crypto.subtle;
  let keyRaw = new TextEncoder().encode(phrase);
  let key = await substl.importKey("raw", keyRaw, "PBKDF2", false, [
    "deriveBits",
  ]);
  let iterations = kdf?.iterations ?? KDF_V2.iterations;
  let hash = kdf?.hash ?? KDF_V2.hash;

  let pbkdf2Params = {
    name: "PBKDF2",
    hash,
    iterations,
    salt: new TextEncoder().encode(saltStr),
  };
  let af = await substl.deriveBits(pbkdf2Params, key, 256);
  let arrPri = new Uint8Array(af);
  let bf64 = ec.base64Encode(arrPri);
  let kp = await ec.generateNewKeyPair(bf64);
  return kp;
}

export async function generateKey(ec: any, pubkey: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const prkKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pubkey),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const prk = await crypto.subtle.sign("HMAC", prkKey, encoder.encode(salt));
  const keyKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(prk),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const keyBuffer = await crypto.subtle.sign("HMAC", keyKey, encoder.encode("cloudflare-d1-access"));
  const keyArray = new Uint8Array(keyBuffer).slice(0, 33);
  return ec.base64Encode(keyArray, 1);
}

export async function generateContentKey(pubkey: string, salt: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const prkKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pubkey),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const prk = await crypto.subtle.sign("HMAC", prkKey, encoder.encode(salt));
  const keyKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(prk),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const keyBuffer = await crypto.subtle.sign("HMAC", keyKey, encoder.encode("d1_content"));
  const keyArray = new Uint8Array(keyBuffer).slice(0, 32);
  return crypto.subtle.importKey(
    "raw",
    keyArray,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function aesGcmEncrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);
  return result;
}

export async function aesGcmDecrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
}

// --- Button Bindings ---

export function bindDecryptBtn(ec: any, state: AppState) {
  const btn = document.getElementById("decryptBtn");
  if (!btn) return;
  btn.onclick = async () => {
    if (!state.G_Input?.pubkey || !state.G_Input?.salt) {
      setErrMsg(messages.errNeedBookmark);
      return;
    }

    let privkey: string;
    if (state.G_Input.private) {
      privkey = state.G_Input.private;
    } else {
      let input = document.getElementById("keyphrase") as HTMLInputElement;
      let phrase = input?.value.trim();
      if (!phrase) {
        setErrMsg(messages.errEmptyPhrase);
        return;
      }

      if (!state.G_Input.salt) {
        setErrMsg('Salt is missing from bookmark');
        return;
      }
      const salt = state.G_Input.salt;
      const kdf = { ver: state.G_Input.ver || KDF_V2.ver, hash: state.G_Input.kdfHash || KDF_V2.hash, iterations: state.G_Input.kdfIterations || KDF_V2.iterations };
      let kp = await pbkdf2(phrase, salt, ec, { hash: kdf.hash, iterations: kdf.iterations });

      if (kp.public !== state.G_Input.pubkey) {
        setErrMsg(messages.errPubkeyMismatchPhrase);
        return;
      }
      privkey = kp.private;
    }

    let base64 = getResultText()?.trim();
    if (!base64) {
      setErrMsg(messages.errEmptyContent);
      return;
    }

    try {
      if (!base64.startsWith('N.')) {
        setErrMsg(messages.errNeedNformat);
        return;
      }

      const nBase64 = base64.slice(2);

      let encryptedData: Uint8Array;
      try {
        encryptedData = ec.base64Decode(nBase64);
      } catch {
        setErrMsg(messages.errDecodeBase64);
        return;
      }

      let decryptedBuffer: ArrayBuffer;
      try {
        decryptedBuffer = await aesGcmDecrypt(encryptedData, await generateContentKey(state.G_Input.pubkey, state.G_Input.salt));
      } catch {
        setErrMsg(messages.errDecryptAes);
        return;
      }

      let dec: Uint8Array;
      try {
        dec = await ec.decrypt(privkey, new Uint8Array(decryptedBuffer));
      } catch {
        setErrMsg(messages.errDecryptEc);
        return;
      }

      let te = new TextDecoder();
      setPlainText(te.decode(dec));
    } catch (error) {
      const errMsg = (error as Error).message;
      if (errMsg.includes('老格式不支持')) {
        setErrMsg('此内容使用老格式加密，请使用 Legacy 版本解密');
      } else {
        setErrMsg(errMsg);
      }
      console.log(error);
    }
  };
}

export function bindSaveBtn(ec: any, state: AppState) {
  const btn = document.getElementById("saveToCloudflare");
  if (!btn) return;
  btn.onclick = async () => {
    const pubkey = state.G_Input?.pubkey;
    if (!pubkey) {
      setErrMsg(messages.errEmptyPubkey);
      return;
    }

    const plainText = getPlainText();
    if (!plainText) {
      setErrMsg(messages.errEmptyContent);
      return;
    }

    const salt = state.G_Input!.salt!;
    const key = encodeURIComponent(await generateKey(ec, pubkey, salt));

    let te = new TextEncoder();
    let enc = await ec.encrypt(pubkey, te.encode(plainText));
    let cipher = ec.base64Encode(enc, 0);

    const contentKey = await generateContentKey(pubkey, salt);
    const cipherBytes = ec.base64Decode(cipher, 0);
    const encryptedCipher = await aesGcmEncrypt(cipherBytes, contentKey);
    const e2 = ec.base64Encode(encryptedCipher, 0, 2);
    const finalTxt = 'N.' + e2;
    setResultText(finalTxt);
    const content = encodeURIComponent(finalTxt);

    const plainTxt = getPlainText();
    const encoder = new TextEncoder();
    const phashKeyData = encoder.encode("phash" + salt);
    const phashKey = await crypto.subtle.importKey(
      "raw",
      phashKeyData,
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const phashBuffer = await crypto.subtle.sign("HMAC", phashKey, encoder.encode(plainTxt));
    const phashArray = new Uint8Array(phashBuffer).slice(0, 32);
    const phash = encodeURIComponent(ec.base64Encode(phashArray, 1));

    const url = `https://ecd1data.kr7y.workers.dev/#key=${key}&phash=${phash}&content=${content}&expire=18`;
    openUrl(url);
    setSyncStatus(messages.saveSuccess);
  };
}

export function bindRestoreBtn(ec: any, state: AppState) {
  const btn = document.getElementById("restoreFromCloudflare");
  if (!btn) return;
  btn.onclick = async () => {
    const pubkey = state.G_Input?.pubkey;
    if (!pubkey) {
      setErrMsg(messages.errEmptyPubkey);
      return;
    }

    const salt = state.G_Input!.salt!;
    const key = encodeURIComponent(await generateKey(ec, pubkey, salt));
    const url = `https://ecd1data.kr7y.workers.dev/list#key=${key}`;
    openUrl(url);
  };
}

export function bindEncryptBtn(ec: any, state: AppState) {
  const btn = document.getElementById("encryptBtn");
  if (!btn) return;
  btn.onclick = async () => {
    const pubkey = state.G_Input?.pubkey;
    if (!pubkey) {
      setErrMsg(messages.errEmptyPubkey);
      return;
    }

    const plainText = getPlainText();
    if (!plainText) {
      setErrMsg(messages.errEmptyContent);
      return;
    }

    const salt = state.G_Input!.salt!;
    let te = new TextEncoder();
    let enc = await ec.encrypt(pubkey, te.encode(plainText));
    let cipher = ec.base64Encode(enc, 0);

    const contentKey = await generateContentKey(pubkey, salt);
    const cipherBytes = ec.base64Decode(cipher, 0);
    const encryptedCipher = await aesGcmEncrypt(cipherBytes, contentKey);
    const e2 = ec.base64Encode(encryptedCipher, 0, 2);
    setResultText('N.' + e2);
  };
}

export function bindCopyResultBtn() {
  const copyBtn = document.getElementById("resultCopyBtn");
  if (!copyBtn) return;
  copyBtn.onclick = () => {
    const el = document.getElementById("resultText") as HTMLTextAreaElement;
    if (el && el.value) {
      navigator.clipboard.writeText(el.value).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      });
    }
  };
}

// --- Bookmark Decode & Init ---

export async function initBookmark(ec: any, state: AppState): Promise<boolean> {
  let search = new URLSearchParams(location.hash);

  let data = search.get("data") as string;
  let data2 = search.get("data2") as string;

  if (data2) {
    data = data2;
  }

  if (!data) {
    return false;
  }

  let plainBf = await ec.decrypt(WEB_PRIVATE, ec.base64Decode(data, data2 ? 1 : 0));
  let plain = new TextDecoder().decode(plainBf);

  let jsonObj = JSON.parse(plain) as InputData;

  if (jsonObj) {
    state.G_Input = jsonObj;
    let inputDataElement = document.getElementById("inputData")!;
    inputDataElement.style.display = 'block';

    const displayData = { ...state.G_Input };
    if (displayData.salt) displayData.salt = maskKey(displayData.salt);
    if (displayData.private) displayData.private = maskKey(displayData.private);

    inputDataElement.innerHTML = `
      <div class="inputData-header">
        <span class="inputData-label">${messages.inputDataLabel}</span>
        <span class="inputData-pubkey">${maskKey(state.G_Input.pubkey)}</span>
        <span class="inputData-toggle">▶</span>
      </div>
      <pre class="inputData-details" style="display:none;margin:0.75rem 0 0;white-space:pre-wrap;word-wrap:break-word;">${JSON.stringify(displayData, null, '\t')}</pre>
    `;

    const header = inputDataElement.querySelector('.inputData-header') as HTMLElement;
    const details = inputDataElement.querySelector('.inputData-details') as HTMLElement;
    const toggle = inputDataElement.querySelector('.inputData-toggle') as HTMLElement;
    header.addEventListener('click', () => {
      const open = details.style.display !== 'none';
      details.style.display = open ? 'none' : '';
      toggle.textContent = open ? '▶' : '▼';
    });
    if (jsonObj.salt) {
      showSaltInfo(jsonObj.salt, state);
    }
    if (jsonObj.private) {
      showMaskedPrivkey(jsonObj.private);
      const passphraseRow = document.getElementById("passphraseRow");
      const passphraseNote = passphraseRow?.nextElementSibling as HTMLElement;
      if (passphraseRow) passphraseRow.style.display = 'none';
      if (passphraseNote) passphraseNote.style.display = 'none';
    }
    return true;
  }

  return false;
}

// --- Bind Common Buttons ---

export function bindCommonButtons(ec: any, state: AppState) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindDecryptBtn(ec, state);
      bindEncryptBtn(ec, state);
      bindSaveBtn(ec, state);
      bindRestoreBtn(ec, state);
      bindCopyResultBtn();
    });
  } else {
    bindDecryptBtn(ec, state);
    bindEncryptBtn(ec, state);
    bindSaveBtn(ec, state);
    bindRestoreBtn(ec, state);
    bindCopyResultBtn();
  }
}

// --- Bind Common Buttons ---

export function showBuildInfo() {
  var buildInfoEl = document.getElementById('buildInfo');
  if (buildInfoEl) {
    var buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';
    var buildMod = typeof __BUILD_MOD__ !== 'undefined' ? __BUILD_MOD__ : '';
    if (buildTime || buildMod) {
      var parts = buildMod.split(/\s+/);
      var mode = parts[0] || '';
      var hash = parts[2] || '';
      buildInfoEl.textContent = `Build:${buildTime} | ${mode} ${hash}`;
    }
  }
}

// --- Squircle ---

export function initSquircle() {
  function applySquircle() {
    Squircle.applyMaskAll('.btn', 30, 5);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySquircle);
  } else {
    applySquircle();
  }
}
