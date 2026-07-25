import { jsMessages as messages } from '@i18n/js-messages';

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
    }
    let G_Input: InputData | undefined;
    let currentSalt: string | undefined;
    let derivedPrivateKey: string | undefined;

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
    document.getElementById("genkeyfrompharse")!.onclick = async () => {
      let input = document.getElementById("keyphrase") as HTMLInputElement;
      let phrase = input?.value.trim();
      if (!phrase) {
        setErrMsg(messages.errEmptyPhrase);
        return;
      }

      if (!G_Input?.pubkey) {
        setErrMsg(messages.errNeedBookmark);
        return;
      }

      const salt = G_Input.salt || FIXED_SALT;
      const kdf = { ver: G_Input.ver || KDF_V2.ver, hash: G_Input.kdfHash || KDF_V2.hash, iterations: G_Input.kdfIterations || KDF_V2.iterations };
      let kp = await pbkdf2(phrase, salt, { hash: kdf.hash, iterations: kdf.iterations });

      if (kp.public !== G_Input.pubkey) {
        setErrMsg(messages.errPubkeyMismatchPhrase);
        return;
      }

      derivedPrivateKey = kp.private;
      setSyncStatus(messages.loadSuccess);
    };

    // 解密按钮
    document.getElementById("decryptBtn")!.onclick = async () => {
      if (!derivedPrivateKey) {
        setErrMsg(messages.errNeedBookmark);
        return;
      }

      let base64 = getPlainText()?.trim();
      if (!base64) {
        setErrMsg(messages.errEmptyContent);
        return;
      }

      if (!G_Input?.pubkey || !G_Input?.salt) {
        setErrMsg(messages.errNeedBookmark);
        return;
      }

      try {
        if (base64.startsWith('N.')) {
          const nBase64 = base64.slice(2);
          const contentKey = await generateContentKey(G_Input.pubkey, G_Input.salt);
          const encryptedData = ec.base64Decode(nBase64);
          const decryptedBuffer = await aesGcmDecrypt(encryptedData, contentKey);
          const decryptedCipher = new Uint8Array(decryptedBuffer);

          let dec = await ec.decrypt(derivedPrivateKey, decryptedCipher);
          let te = new TextDecoder();
          setPlainText(te.decode(dec));
          setSyncStatus(messages.loadSuccess);
        } else {
          setErrMsg(messages.errEmptyContent);
        }
      } catch (error) {
        setErrMsg(error as string);
        console.log(error);
      }
    };

    // 保存到 CloudFlare D1
    document.getElementById("saveToCloudflare")!.onclick = async () => {
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
      const content = encodeURIComponent(finalTxt);

      const emailSubjectEle = document.getElementById("emailsubject") as HTMLInputElement;
      const subject = encodeURIComponent(emailSubjectEle.value.trim() || messages.emailSubjectDefault);

      const url = `https://ecd1data.kr7y.workers.dev/#key=${key}&note=${subject}&content=${content}`;
      openUrl(url);
      setSyncStatus(messages.saveSuccess);
    };

    // 从 CloudFlare 恢复
    document.getElementById("restoreFromCloudflare")!.onclick = async () => {
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

    let webPrivate = "yNmVrcoS5D4xMTvjAPSkZe57HZqPZoIUxznm+SqWKFo=";
    let webPublic = "dTj41nmwoLcguLpM9AntyKgg67xxK4UAxc27CLIcFw=";

    async function genbookmark(
      pubkey: string,
      salt?: string,
      options?: {
        kdf?: { ver: string; hash: string; iterations: number };
        type?: 'phrase' | 'pubkey';
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
      holder?.replaceChildren(a);

      if (options?.type === 'phrase') {
        const hint = document.createElement("p");
        hint.className = "bookmark-hint";
        hint.textContent = messages.bookmarkHint;
        holder?.appendChild(hint);
      }

      const bmPubkey = document.getElementById("bmPubkey");
      const bmSalt = document.getElementById("bmSalt");
      const bmSaltRow = document.getElementById("bmSaltRow");
      const bookmarkInfo = document.getElementById("bookmarkInfo");
      if (bmPubkey) bmPubkey.textContent = pubkey;
      if (bmSalt && salt) {
        bmSalt.textContent = salt;
        bmSaltRow!.style.display = "flex";
      }
      if (bookmarkInfo) bookmarkInfo.style.display = "block";
    }

    document.getElementById("genbookmark2")!.onclick = async () => {
      let input = document.getElementById("keyphraseBookmark") as HTMLInputElement;
      let phrase = input?.value.trim();
      if (!phrase) {
        setErrMsg(messages.errEmptyPhrase);
        return;
      }

      const saltStr = generateRandomSalt();
      let pubkey = (
        await pbkdf2(phrase, saltStr, {
          hash: KDF_V2.hash,
          iterations: KDF_V2.iterations,
        })
      ).public;

      await genbookmark(pubkey, saltStr, {
        kdf: { ...KDF_V2 },
        type: 'phrase',
      });
      showSaltInfo(saltStr);
    };

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
        if (jsonObj.salt) {
          showSaltInfo(jsonObj.salt);
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
