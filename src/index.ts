
import { jsMessages as messages } from '@i18n/js-messages';

const App = (function () {

  async function init() {

  type Base64Type = 'standard' | 'urlsafe' | 'auto'

  function detectBase64Type(str: string): Base64Type | null {
    const trimmed = str.replace(/\s/g, '')
    if (!trimmed) return null
    const hasUrlSafe = /[-_]/.test(trimmed)
    const hasStandard = /[+/]/.test(trimmed)
    if (hasUrlSafe && !hasStandard) return 'urlsafe'
    if (hasStandard && !hasUrlSafe) return 'standard'
    if (!hasUrlSafe && !hasStandard) {
      if (trimmed.endsWith('=')) return 'standard'
      return null
    }
    return 'standard'
  }

  function showBase64TypeModal(): Promise<Base64Type> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div')
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999'

      const box = document.createElement('div')
      box.style.cssText = 'background:#fff;border-radius:12px;padding:2rem;max-width:380px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2)'

      const title = document.createElement('h3')
      title.textContent = messages.modalTitle
      title.style.cssText = 'margin:0 0 0.75rem;font-size:1rem;font-weight:600'

      const desc = document.createElement('p')
      desc.textContent = messages.modalDesc
      desc.style.cssText = 'margin:0 0 1rem;font-size:0.9375rem;color:var(--text-muted,#666)'

      const btnRow = document.createElement('div')
      btnRow.style.cssText = 'display:flex;gap:0.75rem;justify-content:flex-end'

      const makeBtn = (label: string, type: Base64Type, primary = false) => {
        const btn = document.createElement('button')
        btn.textContent = label
        btn.style.cssText = primary
          ? 'padding:0.5rem 1.25rem;border:none;border-radius:8px;background:#000;color:#fff;font-size:0.9375rem;cursor:pointer'
          : 'padding:0.5rem 1.25rem;border:1px solid #ccc;border-radius:8px;background:#fff;font-size:0.9375rem;cursor:pointer'
        btn.onclick = () => { document.body.removeChild(overlay); resolve(type) }
        return btn
      }

      btnRow.appendChild(makeBtn(messages.modalBtnStandard, 'standard'))
      btnRow.appendChild(makeBtn(messages.modalBtnUrlsafe, 'urlsafe', true))
      box.appendChild(title)
      box.appendChild(desc)
      box.appendChild(btnRow)
      overlay.appendChild(box)
      overlay.onclick = (e) => { if (e.target === overlay) { document.body.removeChild(overlay); resolve('standard') } }
      document.body.appendChild(overlay)
    })
  }

  const FIXED_SALT =
    "The California sea lion (Zalophus californianus) is a coastal species of eared seal native to western North America. It is one of six species of sea lion. Its natural habitat ranges from southeast Alaska to central Mexico, including the Gulf of California. This female sea lion was photographed next to a western gull in Scripps Park in the neighborhood of La Jolla in San Diego, California. [2022-04-07 wikipedia]";

  const KDF_V1 = {
    ver: "1.0",
    hash: "SHA-256",
    iterations: 123456,
  } as const;

  const KDF_V2 = {
    ver: "2.0",
    hash: "SHA-512",
    iterations: 210000,
  } as const;

  interface InputData {
    prefix: string;
    pubkey: string;
    toEmail: string;
    emailSubject: string;
    salt?: string;
    ver?: string;
    kdfHash?: string;
    kdfIterations?: number;
    type?: 'phrase' | 'pubkey';
  }
  let G_Input: InputData | undefined;
  let currentSalt: string | undefined;

  function openUrl(url: string) {
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      location.href = url;
    } else {
      window.open(url, "_blank");
    }
  }
  let currentKdf: { ver: string; hash: string; iterations: number } | undefined;

  let ec = await ECC.initEC();

  // 同步两个短语输入框的内容
  function syncKeyphraseInputs() {
    const keyphraseBookmark = document.getElementById("keyphraseBookmark") as HTMLInputElement;
    const keyphrase = document.getElementById("keyphrase") as HTMLInputElement;
    if (!keyphraseBookmark || !keyphrase) return;

    let isSyncing = false;

    const syncFromBookmark = () => {
      if (isSyncing) return;
      isSyncing = true;
      keyphrase.value = keyphraseBookmark.value;
      isSyncing = false;
    };

    const syncFromKeyphrase = () => {
      if (isSyncing) return;
      isSyncing = true;
      keyphraseBookmark.value = keyphrase.value;
      isSyncing = false;
    };

    keyphraseBookmark.addEventListener("input", syncFromBookmark);
    keyphrase.addEventListener("input", syncFromKeyphrase);
  }

  // 确保 DOM 加载完成后再绑定同步事件
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncKeyphraseInputs);
  } else {
    syncKeyphraseInputs();
  }

  function getPirvateKey() {
    let input = document.getElementById("private") as HTMLInputElement;
    if (!input) return '';
    const raw = input.getAttribute('data-raw');
    return (raw || input.value).trim();
  }
  function getPublicKey() {
    let input = document.getElementById("public") as HTMLInputElement;
    return input?.value.trim();
  }

  function setPirvateKey(str: string) {
    let input = document.getElementById("private") as HTMLInputElement;
    input.value = str;
    input.removeAttribute('data-raw');
    input.dispatchEvent(new Event('blur'));
  }
  function setPublicKey(str: string) {
    let input = document.getElementById("public") as HTMLInputElement;
    input.value = str;
  }

  function setPlainText(str: string) {
    let input = document.getElementById("plaintext") as HTMLTextAreaElement;
    return (input.value = str);
  }

  function setCipherText(str: string) {
    let input = document.getElementById("ciphertext") as HTMLTextAreaElement;
    return (input.value = str);
  }

  function getCipherText() {
    let input = document.getElementById("ciphertext") as HTMLTextAreaElement;
    return input.value;
  }

  function getPlainText() {
    let input = document.getElementById("plaintext") as HTMLTextAreaElement;
    return input?.value;
  }

  function setErrMsg(str: string) {
    console.log(str);
    alert(str);
  }

  async function encryptClick() {
    console.log(getPublicKey());
    let p = getPublicKey();
    let text = getPlainText();
    if (!text) {
      setErrMsg(messages.errEmptyPlain);
      return false;
    }
    try {
      let te = new TextEncoder();
      let enc = await ec.encrypt(p, te.encode(text));
      setCipherText(ec.base64Encode(enc, 0));
      return true;
    } catch (error) {
      setErrMsg(error as string);
      console.log(error);
      return false;
    }
  }
  document.getElementById("encrypt")!.onclick = async () => {
    await encryptClick();
  };

  document.getElementById("decrypt")!.onclick = async () => {
    let p = getPirvateKey();

    let fileInput = document.getElementById("cipherfile") as HTMLInputElement;
    let file = fileInput.files?.item(0);
    if (file) {
      try {
        let reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = async () => {
          try {
            let aaa = new Uint8Array(reader.result as ArrayBuffer);
            let dec = await ec.decrypt(p, aaa);
            let te = new TextDecoder();
            setPlainText(te.decode(dec));
          } catch (error) {
            setErrMsg(error as string);
            console.log(error);
          }
        };
      } catch (error) {
        setErrMsg(error as string);
        console.log(error);
      }

      return;
    }

    let base64 = getCipherText().trim();
    if (!base64) {
      setErrMsg(messages.errEmptyCipher);
      return;
    }
    try {
      // 检查是否是 N. 格式（CloudFlare D1 保存的加密密文）
      if (base64.startsWith('N.')) {
        const pubkey = getPublicKey();
        const salt = G_Input?.salt;
        console.log('=== N. format debug ===');
        console.log('pubkey:', pubkey?.substring(0, 20) + '...');
        console.log('salt:', salt?.substring(0, 20) + '...');
        if (!pubkey || !salt) {
          setErrMsg(messages.errDecryptNFormat);
          return;
        }

        try {
          // 先用 AES-GCM 解密
          const contentKey = await generateContentKey(pubkey, salt);
          const nBase64 = base64.slice(2);
          console.log('nBase64 length:', nBase64.length);
          console.log('nBase64 first 100:', nBase64.substring(0, 100));
          const encryptedData = ec.base64Decode(nBase64);
          console.log('encryptedData length:', encryptedData.length);
          console.log('encryptedData first 20:', Array.from(encryptedData.slice(0, 20)));

          // AES-GCM 解密
          const iv = encryptedData.slice(0, 12);
          const ciphertext = encryptedData.slice(12);
          console.log('iv length:', iv.length);
          console.log('ciphertext length:', ciphertext.length);
          console.log('ciphertext last 16 (tag):', Array.from(ciphertext.slice(-16)));

          const decryptedBuffer = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            contentKey,
            ciphertext
          );
          console.log('decryptedBuffer type:', typeof decryptedBuffer);
          console.log('decryptedBuffer byteLength:', (decryptedBuffer as ArrayBuffer).byteLength);

          const decryptedCipher = new Uint8Array(decryptedBuffer);
          console.log('decryptedCipher length:', decryptedCipher.length);
          console.log('decryptedCipher first 20:', Array.from(decryptedCipher.slice(0, 20)));
          console.log('decryptedCipher byte0:', decryptedCipher[0]);

          // 直接用解密后的字节传给 ec.decrypt
          let dec = await ec.decrypt(p, decryptedCipher);
          let te = new TextDecoder();
          setPlainText(te.decode(dec));
        } catch (e) {
          console.error('N. format decrypt error:', e);
          setErrMsg(messages.errDecryptNFailed + ": " + e);
        }
      } else {
        // 普通密文解密
        const detected = detectBase64Type(base64)
        let urlsafe: 0 | 1
        if (detected !== null) {
          urlsafe = detected === 'urlsafe' ? 1 : 0
        } else {
          const chosen = await showBase64TypeModal()
          urlsafe = chosen === 'urlsafe' ? 1 : 0
        }
        let arr = ec.base64Decode(base64, urlsafe);
        let dec = await ec.decrypt(p, arr);
        let te = new TextDecoder();
        setPlainText(te.decode(dec));
      }
    } catch (error) {
      setErrMsg(error as string);
      console.log(error);
    }
  };

  document.getElementById("genpubkey")!.onclick = async () => {
    let seckey = getPirvateKey();
    console.log(seckey);
    if (!seckey) {
      setErrMsg(messages.errEmptyPrivkey);
      return;
    }
    try {
      let kp = await ec.generateNewKeyPair(seckey);

      // 书签模式下检查公钥是否匹配
      if (G_Input?.pubkey && kp.public !== G_Input.pubkey) {
        setErrMsg(messages.errPubkeyMismatchPrivkey);
        return;
      }

      setPirvateKey(kp.private);
      setPublicKey(kp.public);
    } catch (error: any) {
      setErrMsg(error.toString());
    }
  };

  function generateRandomSalt(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(33));
    return ec.base64Encode(bytes);
  }

  function resolveSalt(): string {
    if (G_Input?.salt) {
      return G_Input.salt;
    }
    if (G_Input) {
      return FIXED_SALT;
    }
    // 没有从书签带入 salt 的情况下，只在页面生命周期内生成一次并复用，
    // 避免用户多次点击“根据短语生成”导致每次派生结果不同。
    if (currentSalt) return currentSalt;
    currentSalt = generateRandomSalt();
    return currentSalt;
  }

  function kdfFromInput(
    input?: InputData
  ): { ver: string; hash: string; iterations: number } | undefined {
    if (!input) return undefined;
    if (input.kdfHash && input.kdfIterations) {
      return {
        ver: input.ver ?? KDF_V1.ver,
        hash: input.kdfHash,
        iterations: input.kdfIterations,
      };
    }
    if (input.ver === KDF_V2.ver) return { ...KDF_V2 };
    if (input.ver === KDF_V1.ver) return { ...KDF_V1 };
    return undefined;
  }

  function resolveKdfParams(): { ver: string; hash: string; iterations: number } {
    const fromBookmark = kdfFromInput(G_Input);
    if (fromBookmark) return fromBookmark;
    if (!G_Input) return { ...KDF_V2 };
    return { ...KDF_V1 };
  }

  function resolveKdfForBookmark(): { ver: string; hash: string; iterations: number } {
    const fromBookmark = kdfFromInput(G_Input);
    if (fromBookmark) return fromBookmark;
    if (G_Input) return { ...KDF_V1 };
    if (currentKdf) return { ...currentKdf };
    return { ...KDF_V2 };
  }

  function getAvailableSalt(): string | undefined {
    return G_Input?.salt ?? currentSalt;
  }

  function showSaltInfo(salt: string) {
    currentSalt = salt;
    const row = document.getElementById("saltRow");
    const el = document.getElementById("salt");
    if (!row || !el) return;
    el.textContent = salt;
    row.style.display = "flex";

    const hint = document.getElementById("saltSaveHint");
    if (hint) {
      hint.style.display = G_Input ? "none" : "block";
    }
  }

  async function pbkdf2(
    phrase: string,
    saltStr?: string,
    kdf?: { hash: string; iterations: number }
  ) {
    var substl = crypto.subtle;

    let keyRaw = new TextEncoder().encode(phrase);

    let key = await substl.importKey("raw", keyRaw, "PBKDF2", false, [
      "deriveBits",
    ]);
    let salt = saltStr ?? FIXED_SALT;
    let iterations = kdf?.iterations ?? KDF_V1.iterations;
    let hash = kdf?.hash ?? KDF_V1.hash;

    let pbkdf2 = {
      name: "PBKDF2",
      hash,
      iterations,
      salt: new TextEncoder().encode(salt),
    };
    let af = await substl.deriveBits(pbkdf2, key, 256);
    let arrPri = new Uint8Array(af);

    console.log(ec.base64Encode(arrPri));

    let bf64 = ec.base64Encode(arrPri);
    let kp = await ec.generateNewKeyPair(bf64);

    return kp;
  }

  document.getElementById("genkeyfrompharse")!.onclick = async () => {
    let input = document.getElementById("keyphrase") as HTMLInputElement;
    let phrase = input?.value.trim();
    if (!phrase) {
      setErrMsg(messages.errEmptyPhrase);
      return;
    }

    const salt = resolveSalt();
    if (G_Input?.prefix && !G_Input.salt) {
      phrase = `${G_Input.prefix}${phrase}`;
    }

    const kdf = resolveKdfParams();
    currentKdf = kdf;
    let kp = await pbkdf2(phrase, salt, { hash: kdf.hash, iterations: kdf.iterations });

    // 书签模式下检查公钥是否匹配
    if (G_Input?.pubkey && kp.public !== G_Input.pubkey) {
      setErrMsg(messages.errPubkeyMismatchPhrase);
      return;
    }

    setPirvateKey(kp.private);
    setPublicKey(kp.public);
    showSaltInfo(salt);
  };

  document.getElementById("downloadPlain")!.onclick = async () => {
    let s = getPlainText();
    if (!s) {
      setErrMsg(messages.errEmptyFile);
      return;
    }
    let te = new TextEncoder();
    let blob = new Blob([te.encode(s)]);
    const fileName = `dec_${filename()}.txt`;
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(link.href);
  };

  function beijingtime() {
    return (
      new Date(Date.now() + 8 * 3600000)
        .toISOString()
        .replace("T", " ")
        .replace("Z", "") + " +0800"
    );
  }

  function filename() {
    return beijingtime().replace(/:/g, "_").substring(0, 19);
  }

  document.getElementById("downloadCipher")!.onclick = async () => {
    let s = getCipherText().trim();
    if (!s) {
      setErrMsg(messages.errEmptyFile);
      return;
    }
    let cipher = ec.base64Decode(s);
    let blob = new Blob([cipher]);
    const fileName = `enc_${filename()}.txt.ec`;
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(link.href);
  };

  document.getElementById("clearfile")!.onclick = async () => {
    let obj = document.getElementById("clearfileform") as HTMLFormElement;
    obj.reset();
  };
  document.getElementById("sendemail2")!.onclick = async () => {
    let cipher = getCipherText().trim();
    if (!cipher) {
      let t = await encryptClick();
      if (!t) {
        return;
      }
      cipher = getCipherText().trim();
      if (!cipher) {
        return;
      }
    }

    let checkbox = document.getElementById('newline') as  HTMLInputElement;
    let newLine =   checkbox.checked ?  "          <br><br>        ": "\n";

    let log = console.log;
    log('newLine ' + newLine + "--")

 

    let msg = `
${G_Input?.prefix || ""} ${newLine}
${messages.emailBackupTime}:${beijingtime()} ${newLine}

${messages.emailPubkey}:${getPublicKey()}    ${newLine}

${messages.emailWebUrl}:     ${newLine}
   ${location.href}         ${newLine}
${messages.emailDataBase64}:


   `;
    let mailto = `mailto:${G_Input.toEmail}?subject=${encodeURIComponent(
      G_Input.emailSubject || messages.emailSubjectDefault
    )}&body=${encodeURIComponent(msg)}`;
    console.log(mailto);
    window.open(mailto, "target", "");
  };
  document.getElementById("sendemail")!.onclick = async () => {
    let cipher = getCipherText().trim();
    if (!cipher) {
      let t = await encryptClick();
      if (!t) {
        return;
      }
      cipher = getCipherText().trim();
      if (!cipher) {
        return;
      }
    }

    let checkbox = document.getElementById('newline') as  HTMLInputElement;
    let newLine =   checkbox.checked ?  "          <br><br>        ": "\n";
    let log = console.log;
    log('newLine ' + newLine + "--")


    let msg = `
${G_Input?.prefix || ""}  ${newLine}
${messages.emailBackupTime}:${beijingtime()} ${newLine}

${messages.emailPubkey}:${getPublicKey()} ${newLine}

${messages.emailWebUrl}: ${newLine}
${location.href}  ${newLine}

${messages.emailDataBase64}: ${newLine}

   ${cipher}



   `;
    let mailto = `mailto:${G_Input.toEmail}?subject=${encodeURIComponent(
      G_Input.emailSubject || messages.emailSubjectDefault
    )}&body=${encodeURIComponent(msg)}`;
    console.log('mailto',mailto);
    window.open(mailto, "target", "");
  };

  // HMAC-SHA512 两层派生，截取前33字节转为 Base64（用于 D1 key）
  async function generateKey(pubkey: string, salt: string): Promise<string> {
    const encoder = new TextEncoder();

    // PRK = hmac_sha512(pubkey, salt)
    const prkKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(pubkey),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const prk = await crypto.subtle.sign("HMAC", prkKey, encoder.encode(salt));

    // KEY = hmac_sha512(PRK, "cloudflare-d1-access") 截取前33字节
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

  // HMAC-SHA512 两层派生，截取前32字节（用于内容加密）
  async function generateContentKey(pubkey: string, salt: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();

    // PRK = hmac_sha512(pubkey, salt)
    const prkKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(pubkey),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const prk = await crypto.subtle.sign("HMAC", prkKey, encoder.encode(salt));

    // KEY = hmac_sha512(PRK, "d1_content") 截取前32字节
    const keyKey = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(prk),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const keyBuffer = await crypto.subtle.sign("HMAC", keyKey, encoder.encode("d1_content"));
    const keyArray = new Uint8Array(keyBuffer).slice(0, 32);

    // 导入为 AES-GCM256 密钥
    return crypto.subtle.importKey(
      "raw",
      keyArray,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  }

  // AES-GCM256 加密
  async function aesGcmEncrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    // 前12字节是 IV，后面是密文
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.length);
    return result;
  }

  // AES-GCM256 解密
  async function aesGcmDecrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);
    return crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
  }

  // 保存到 CloudFlare
  document.getElementById("saveToCloudflare")!.onclick = async () => {
    const pubkey = getPublicKey();
    if (!pubkey) {
      setErrMsg(messages.errEmptyPubkey);
      return;
    }

    // 检查是否从书签入口进入（有 salt）
    if (!G_Input?.salt) {
      setErrMsg(messages.errNeedBookmark);
      return;
    }

    // 从明文重新加密，确保使用最新内容
    const t = await encryptClick();
    if (!t) return;
    const cipher = getCipherText().trim();
    if (!cipher) return;

    const salt = G_Input.salt;
    const key = encodeURIComponent(await generateKey(pubkey, salt));
    const emailSubjectEle = document.getElementById("emailsubject") as HTMLInputElement;
    const subject = emailSubjectEle.value.trim() || messages.emailSubjectDefault;

    // 对密文进行二次加密
    const contentKey = await generateContentKey(pubkey, salt);
    const cipherBytes = ec.base64Decode(cipher, 0);
    const encryptedCipher = await aesGcmEncrypt(cipherBytes, contentKey);
    const e2 = ec.base64Encode(encryptedCipher, 0, 2); // firstLineLess=2 for "N." prefix alignment
    const finalTxt = 'N.' + e2;

    let content = finalTxt;

    const note = encodeURIComponent(subject);
    const encodedContent = encodeURIComponent(content);
    console.log('encodedContent',encodedContent);

    // 计算 phash = HMAC_sha512(plainTxt, "plainHash").slice(0, 32) 然后 base64url 编码
    const plainTxt = getPlainText();
    const encoder = new TextEncoder();
    const phashKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode("plainHash"),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const phashBuffer = await crypto.subtle.sign("HMAC", phashKey, encoder.encode(plainTxt));
    const phashArray = new Uint8Array(phashBuffer).slice(0, 32);
    const phash = encodeURIComponent(ec.base64Encode(phashArray, 1));

    const url = `https://ecd1data.kr7y.workers.dev/#key=${key}&note=${note}&phash=${phash}&content=${encodedContent}`;
    openUrl(url);
  };

  // 从 CloudFlare 恢复
  document.getElementById("restoreFromCloudflare")!.onclick = async () => {
    const pubkey = getPublicKey();
    if (!pubkey) {
      setErrMsg(messages.errEmptyPubkey);
      return;
    }

    // 检查是否从书签入口进入（有 salt）
    if (!G_Input?.salt) {
      setErrMsg(messages.errNeedBookmark);
      return;
    }

    const salt = G_Input.salt;
    const key = encodeURIComponent(await generateKey(pubkey, salt));
    const url = `https://ecd1data.kr7y.workers.dev/list#key=${key}`;
    openUrl(url);
  };

  let webPrivate = "yNmVrcoS5D4xMTvjAPSkZe57HZqPZoIUxznm+SqWKFo=";
  let webPublic = "dTj41nmwoLcguLpM9AntyKgg67xx6K4UAxc27CLIcFw=";

  async function genbookmark(
    pubkey: string,
    toEmail: string,
    prefix: string,
    emailSubject?: string,
    salt?: string,
    options?: {
      phraseHint?: boolean;
      kdf?: { ver: string; hash: string; iterations: number };
      type?: 'phrase' | 'pubkey';
    }
  ) {
    let s: InputData = { prefix, pubkey, toEmail, emailSubject };
    if (salt) {
      s.salt = salt;
    }
    if (options?.kdf) {
      s.ver = options.kdf.ver;
      s.kdfHash = options.kdf.hash;
      s.kdfIterations = options.kdf.iterations;
    }
    if (options?.type) {
      s.type = options.type;
    }

    let jsonstring = JSON.stringify(s);
    let arr = new TextEncoder().encode(jsonstring);
    let dataBuff = await ec.encrypt(webPublic, arr);
    let data = ec.base64Encode(dataBuff,1).replace(/[\r\n]/g, '');


    let bookmark = `${location.origin}${
      location.pathname
    }?t=${new Date().toISOString()}#&data2=${encodeURIComponent(data)}`;

    console.log('网页地址:', bookmark);

    let a = document.createElement("a");
    a.innerText = bookmark;
    a.href = bookmark;

    let holder = document.getElementById("bookmark");
    holder?.replaceChildren(a);

    if (options?.phraseHint) {
      const hint = document.createElement("p");
      hint.className = "bookmark-hint";
      hint.textContent = messages.bookmarkHint;
      holder?.appendChild(hint);
    }

    // 填充书签信息卡片
    const bmPubkey = document.getElementById("bmPubkey");
    const bmEmail = document.getElementById("bmEmail");
    const bmSubject = document.getElementById("bmSubject");
    const bmPrefix = document.getElementById("bmPrefix");
    const bmSalt = document.getElementById("bmSalt");
    const bmSaltRow = document.getElementById("bmSaltRow");
    const bookmarkInfo = document.getElementById("bookmarkInfo");
    if (bmPubkey) bmPubkey.textContent = pubkey;
    if (bmEmail) bmEmail.textContent = toEmail;
    if (bmSubject) bmSubject.textContent = emailSubject || "";
    if (bmPrefix) bmPrefix.textContent = prefix;
    if (bmSalt && salt) {
      bmSalt.textContent = salt;
      bmSaltRow!.style.display = "flex";
    }
    if (bookmarkInfo) bookmarkInfo.style.display = "block";
  }

  document.getElementById("genbookmark2")!.onclick = async () => {
    let input = document.getElementById("keyphrase") as HTMLInputElement;
    let phrase = input?.value.trim();
    if (!phrase) {
      setErrMsg(messages.errEmptyPhrase);
      return;
    }

    let prefixE = document.getElementById("prefix") as HTMLInputElement;
    let prefix = prefixE.value.trim();

    const saltStr = generateRandomSalt();
    let pubkey = (
      await pbkdf2(phrase, saltStr, {
        hash: KDF_V2.hash,
        iterations: KDF_V2.iterations,
      })
    ).public;

    let emailEle = document.getElementById("email") as HTMLInputElement;
    let toEmail = emailEle.value.trim();

    let emailSubjectEle = document.getElementById(
      "emailsubject"
    ) as HTMLInputElement;
    let subject = emailSubjectEle.value.trim();

    await genbookmark(pubkey, toEmail, prefix, subject, saltStr, {
      kdf: { ...KDF_V2 },
      type: 'phrase',
    });
    showSaltInfo(saltStr);
  };

  let btime = document.getElementById("build") as HTMLElement;
  btime.innerText = "Package:" + __BUILD_MOD__ + "\n " + __BUILD_TIME__;

  (async function initDefaultValues() {

    console.log(location.hash);
    let search = new URLSearchParams(location.hash);

    let data = search.get("data") as string;
    let data2 = search.get("data2") as string;
    
    // Use data2 if available, otherwise use data
    if (data2) {
      data = data2
    }

    if (!data) {
      return; // No data to process
    }

    let ttlog = console.log;
    ttlog({ webPrivate, webPublic });

    let plainBf = await ec.decrypt(webPrivate, ec.base64Decode(data, data2 ? 1 : 0));
    let plain = new TextDecoder().decode(plainBf);
    ttlog(plain);

    let jsonObj = JSON.parse(plain) as InputData;

    if (jsonObj) {
      G_Input = jsonObj;
      let inputDataElement = document.getElementById("inputData")!;
      inputDataElement.style.display = 'block'
      inputDataElement.innerText = `${messages.inputDataLabel}:\n ${JSON.stringify(
        G_Input,
        null,
        "\t"
      )}`;
      setPublicKey(jsonObj.pubkey);
      const kdf = kdfFromInput(jsonObj);
      if (kdf) {
        currentKdf = kdf;
      }
      if (jsonObj.salt) {
        showSaltInfo(jsonObj.salt);
      }
    } else {
    }
  })();

  }

  return { init };
})();
App.init();



 