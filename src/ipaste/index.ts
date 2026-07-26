import { jsMessages as messages } from '@i18n/js-messages';
import { htmlMessages } from '@i18n/html-messages';

const App = (function () {

  async function init() {
    const FIXED_SALT =
      "The California sea lion (Zalophus californianus) is a coastal species of eared seal native to western North America. It is one of six species of sea lion. Its natural habitat ranges from southeast Alaska to central Mexico, including the Gulf of California. This female sea lion was photographed next to a western gull in Scripps Park in the neighborhood of La Jolla in San Diego, California. [2022-04-07 wikipedia]";

    const KDF_V2 = {
      ver: "2.0",
      hash: "SHA-512",
      iterations: 210000,
    } as const;

    interface InputData {
      pubkey: string;
      salt?: string;
      ver?: string;
      kdfHash?: string;
      kdfIterations?: number;
      type?: 'phrase' | 'pubkey';
      private?: string;
    }
    let G_Input: InputData | undefined;
    let currentSalt: string | undefined;
    let ec = await ECC.initEC();

    function openUrl(url: string) {
      if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        location.href = url;
      } else {
        window.open(url, "_blank");
      }
    }

    function getPlainText() {
      let input = document.getElementById("plaintext") as HTMLTextAreaElement;
      return input?.value;
    }

    function setPlainText(str: string) {
      let input = document.getElementById("plaintext") as HTMLTextAreaElement;
      if (input) input.value = str;
    }

    function setSyncStatus(str: string) {
      const el = document.getElementById("syncStatus");
      if (el) el.textContent = str;
    }

    function setResultText(str: string) {
      const el = document.getElementById("resultText") as HTMLTextAreaElement;
      const copyBtn = document.getElementById("resultCopyBtn");
      if (el) {
        el.value = str;
        el.style.display = str ? '' : 'none';
      }
      if (copyBtn) copyBtn.style.display = str ? '' : 'none';
    }

    function setErrMsg(str: string) {
      console.log(str);
      alert(str);
    }

    function generateRandomSalt(): string {
      const bytes = crypto.getRandomValues(new Uint8Array(33));
      return ec.base64Encode(bytes);
    }

    function showSaltInfo(salt: string) {
      currentSalt = salt;
      const row = document.getElementById("saltRow");
      const el = document.getElementById("salt");
      if (!row || !el) return;
      el.textContent = salt;
      row.style.display = "flex";
    }

    function maskKey(key: string): string {
      if (key.length <= 6) return key;
      return key.slice(0, 3) + '*'.repeat(key.length - 6) + key.slice(-3);
    }

    function showMaskedPrivkey(privkey: string) {
      const row = document.getElementById("bmPrivkeyRow");
      const el = document.getElementById("bmPrivkey");
      if (!row || !el) return;
      el.textContent = maskKey(privkey);
      row.style.display = "flex";
    }

    async function pbkdf2(
      phrase: string,
      saltStr: string,
      kdf?: { hash: string; iterations: number }
    ) {
      let substl = crypto.subtle;
      let keyRaw = new TextEncoder().encode(phrase);
      let key = await substl.importKey("raw", keyRaw, "PBKDF2", false, [
        "deriveBits",
      ]);
      let iterations = kdf?.iterations ?? KDF_V2.iterations;
      let hash = kdf?.hash ?? KDF_V2.hash;

      let pbkdf2 = {
        name: "PBKDF2",
        hash,
        iterations,
        salt: new TextEncoder().encode(saltStr),
      };
      let af = await substl.deriveBits(pbkdf2, key, 256);
      let arrPri = new Uint8Array(af);
      let bf64 = ec.base64Encode(arrPri);
      let kp = await ec.generateNewKeyPair(bf64);
      return kp;
    }

    // HMAC-SHA512 两层派生，截取前33字节转为 Base64（用于 D1 key）
    async function generateKey(pubkey: string, salt: string): Promise<string> {
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

    // HMAC-SHA512 两层派生，截取前32字节（用于内容加密）
    async function generateContentKey(pubkey: string, salt: string): Promise<CryptoKey> {
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

    // AES-GCM256 加密
    async function aesGcmEncrypt(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
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

    // 派生私钥（用于解密）
    function bindDecryptBtn() {
      const btn = document.getElementById("decryptBtn");
      if (!btn) return;
      btn.onclick = async () => {
        if (!G_Input?.pubkey || !G_Input?.salt) {
          setErrMsg(messages.errNeedBookmark);
          return;
        }

        let privkey: string;
        if (G_Input.private) {
          privkey = G_Input.private;
        } else {
          let input = document.getElementById("keyphrase") as HTMLInputElement;
          let phrase = input?.value.trim();
          if (!phrase) {
            setErrMsg(messages.errEmptyPhrase);
            return;
          }

          const salt = G_Input.salt || FIXED_SALT;
          const kdf = { ver: G_Input.ver || KDF_V2.ver, hash: G_Input.kdfHash || KDF_V2.hash, iterations: G_Input.kdfIterations || KDF_V2.iterations };
          let kp = await pbkdf2(phrase, salt, { hash: kdf.hash, iterations: kdf.iterations });

          if (kp.public !== G_Input.pubkey) {
            setErrMsg(messages.errPubkeyMismatchPhrase);
            return;
          }
          privkey = kp.private;
        }

        let base64 = getPlainText()?.trim();
        if (!base64) {
          setErrMsg(messages.errEmptyContent);
          return;
        }

        try {
          if (base64.startsWith('N.')) {
            const nBase64 = base64.slice(2);
            const contentKey = await generateContentKey(G_Input.pubkey, G_Input.salt);
            const encryptedData = ec.base64Decode(nBase64);
            const decryptedBuffer = await aesGcmDecrypt(encryptedData, contentKey);
            const decryptedCipher = new Uint8Array(decryptedBuffer);

            let dec = await ec.decrypt(privkey, decryptedCipher);
            let te = new TextDecoder();
            setResultText(te.decode(dec));
            setSyncStatus(messages.loadSuccess);
          } else {
            setErrMsg(messages.errEmptyContent);
          }
        } catch (error) {
          const errMsg = error as string;
          // 友好提示老格式不支持
          if (errMsg.includes('老格式不支持')) {
            setErrMsg('此内容使用老格式加密，请使用 Legacy 版本解密');
          } else {
            setErrMsg(errMsg);
          }
          console.log(error);
        }
      };
    }

    function bindSaveBtn() {
      const btn = document.getElementById("saveToCloudflare");
      if (!btn) return;
      btn.onclick = async () => {
        const pubkey = G_Input?.pubkey;
        if (!pubkey) {
          setErrMsg(messages.errEmptyPubkey);
          return;
        }

        const plainText = getPlainText();
        if (!plainText) {
          setErrMsg(messages.errEmptyContent);
          return;
        }

        const salt = G_Input!.salt!;
        const key = encodeURIComponent(await generateKey(pubkey, salt));

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

        // phash = HMAC_sha512(plainTxt, "phash" + salt).slice(0, 32)
        // 目的：防止重复提交（相同盐+相同明文 → 相同 phash），服务器据此去重
        // 注意：不作为完整性校验——content 是明文出现在 URL 中，phash 无法防止篡改
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

        const url = `https://ecd1data.kr7y.workers.dev/#key=${key}&phash=${phash}&content=${content}`;
        openUrl(url);
        setSyncStatus(messages.saveSuccess);
      };
    }

    function bindRestoreBtn() {
      const btn = document.getElementById("restoreFromCloudflare");
      if (!btn) return;
      btn.onclick = async () => {
        const pubkey = G_Input?.pubkey;
        if (!pubkey) {
          setErrMsg(messages.errEmptyPubkey);
          return;
        }

        const salt = G_Input!.salt!;
        const key = encodeURIComponent(await generateKey(pubkey, salt));
        const url = `https://ecd1data.kr7y.workers.dev/list#key=${key}`;
        openUrl(url);
      };
    }

    function bindEncryptBtn() {
      const btn = document.getElementById("encryptBtn");
      if (!btn) return;
      btn.onclick = async () => {
        const pubkey = G_Input?.pubkey;
        if (!pubkey) {
          setErrMsg(messages.errEmptyPubkey);
          return;
        }

        const plainText = getPlainText();
        if (!plainText) {
          setErrMsg(messages.errEmptyContent);
          return;
        }

        const salt = G_Input!.salt!;
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

    function bindGenBookmarkBtn() {
      const btn = document.getElementById("genbookmark2");
      if (!btn) return;
      btn.onclick = async () => {
        let input = document.getElementById("keyphraseBookmark") as HTMLInputElement;
        let phrase = input?.value.trim();
        if (!phrase) {
          setErrMsg(messages.errEmptyPhrase);
          return;
        }

        const savePrivkey = (document.getElementById("savePrivkeyToggle") as HTMLInputElement)?.checked;
        const saltStr = generateRandomSalt();
        let kp = await pbkdf2(phrase, saltStr, {
          hash: KDF_V2.hash,
          iterations: KDF_V2.iterations,
        });

        await genbookmark(kp.public, saltStr, {
          kdf: { ...KDF_V2 },
          type: 'phrase',
          private: savePrivkey ? kp.private : undefined,
        });
        showSaltInfo(saltStr);
      };
    }

    function bindCopyResultBtn() {
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

    function bindSavePrivkeyToggle() {
      const toggle = document.getElementById("savePrivkeyToggle") as HTMLInputElement;
      if (!toggle) return;

      function updateBookmarkUI() {
        const checked = toggle.checked;
        const bmGenTitleEl = document.getElementById("bmGenTitle");
        const btn = document.getElementById("genbookmark2");
        if (bmGenTitleEl) {
          bmGenTitleEl.textContent = checked ? htmlMessages.bmGenTitlePrivkey : htmlMessages.bmGenTitle;
        }
        if (btn) {
          btn.style.backgroundColor = checked ? '#e74c3c' : '#1a1a1d';
        }
      }

      toggle.addEventListener('change', () => {
        if (toggle.checked && !confirm(messages.bmSavePrivkeyConfirm)) {
          toggle.checked = false;
        }
        updateBookmarkUI();
      });
    }

    // Bind all event handlers after DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        bindGenBookmarkBtn();
        bindDecryptBtn();
        bindEncryptBtn();
        bindSaveBtn();
        bindRestoreBtn();
        bindCopyResultBtn();
        bindSavePrivkeyToggle();
      });
    } else {
      bindGenBookmarkBtn();
      bindDecryptBtn();
      bindEncryptBtn();
      bindSaveBtn();
      bindRestoreBtn();
      bindCopyResultBtn();
      bindSavePrivkeyToggle();
    }

    let webPrivate = "yNmVrcoS5D4xMTvjAPSkZe57HZqPZoIUxznm+SqWKFo=";
    let webPublic = "dTj41nmwoLcguLpM9AntyKgg67xx6K4UAxc27CLIcFw=";

    async function genbookmark(
      pubkey: string,
      salt?: string,
      options?: {
        kdf?: { ver: string; hash: string; iterations: number };
        type?: 'phrase' | 'pubkey';
        private?: string;
      }
    ) {
      let s: InputData = { pubkey };
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
      if (options?.private) {
        s.private = options.private;
      }

      let jsonstring = JSON.stringify(s);
      let arr = new TextEncoder().encode(jsonstring);
      let dataBuff = await ec.encrypt(webPublic, arr);
      let data = ec.base64Encode(dataBuff, 1).replace(/[\r\n]/g, '');

      let bookmark = `${location.origin}${location.pathname}?t=${new Date().toISOString()}#&data2=${encodeURIComponent(data)}`;

      console.log('网页地址:', bookmark);

      let a = document.createElement("a");
      a.innerText = bookmark;
      a.href = bookmark;

      let holder = document.getElementById("bookmark");
      if (holder) {
        holder.innerHTML = '';
        holder.appendChild(a);
      }

      if (options?.type === 'phrase') {
        const hint = document.createElement("p");
        hint.className = "bookmark-hint";
        hint.textContent = messages.bookmarkHint;
        holder?.appendChild(hint);
      }

      const bmPubkey = document.getElementById("bmPubkey");
      const bmSalt = document.getElementById("bmSalt");
      const bmSaltRow = document.getElementById("bmSaltRow");
      const bmPrivkeyRow = document.getElementById("bmPrivkeyRow");
      const bookmarkInfo = document.getElementById("bookmarkInfo");
      if (bmPubkey) bmPubkey.textContent = pubkey;
      if (bmSalt && salt) {
        bmSalt.textContent = maskKey(salt);
        bmSaltRow!.style.display = "flex";
      }
      if (bmPrivkeyRow) bmPrivkeyRow.style.display = "none";
      if (options?.private) {
        showMaskedPrivkey(options.private);
      }
      if (bookmarkInfo) {
        bookmarkInfo.style.display = "block";
      }
    }

    (async function initDefaultValues() {
      console.log(location.hash);
      let search = new URLSearchParams(location.hash);

      let data = search.get("data") as string;
      let data2 = search.get("data2") as string;

      if (data2) {
        data = data2;
      }

      if (!data) {
        return;
      }

      let plainBf = await ec.decrypt(webPrivate, ec.base64Decode(data, data2 ? 1 : 0));
      let plain = new TextDecoder().decode(plainBf);

      let jsonObj = JSON.parse(plain) as InputData;

      if (jsonObj) {
        G_Input = jsonObj;
        let inputDataElement = document.getElementById("inputData")!;
        inputDataElement.style.display = 'block'
        const displayData = { ...G_Input };
        if (displayData.salt) displayData.salt = maskKey(displayData.salt);
        if (displayData.private) displayData.private = maskKey(displayData.private);
        inputDataElement.innerText = `${messages.inputDataLabel}:\n ${JSON.stringify(
          displayData,
          null,
          "\t"
        )}`;
        if (jsonObj.salt) {
          showSaltInfo(jsonObj.salt);
        }
        if (jsonObj.private) {
          showMaskedPrivkey(jsonObj.private);
          const passphraseRow = document.getElementById("passphraseRow");
          const passphraseNote = passphraseRow?.nextElementSibling as HTMLElement;
          if (passphraseRow) passphraseRow.style.display = 'none';
          if (passphraseNote) passphraseNote.style.display = 'none';
        }
      }
    })();

    // Show sync section when hash params are present
    (function () {
      function hasHashParams() {
        var h = window.location.hash.slice(1).trim();
        return h.length > 0 && h.indexOf('=') !== -1;
      }
      var syncSection = document.getElementById('syncSection');
      var usageSection = document.querySelector('.usage-section');
      if (hasHashParams() && syncSection && usageSection) {
        syncSection.style.display = '';
        usageSection.style.display = 'none';
      }
    })();

  }

  return { init };
})();
App.init();

(function initSquircle() {
  function applySquircle() {
    Squircle.applyMaskAll('.btn', 30, 5);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySquircle);
  } else {
    applySquircle();
  }
})();
