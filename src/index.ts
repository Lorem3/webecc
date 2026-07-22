
const App = (function () {

  async function init() {

  type Base64Type = 'standard' | 'urlsafe' | 'auto'

  function getBase64Type(): Base64Type {
    const checked = document.querySelector('input[name="base64Type"]:checked') as HTMLInputElement
    return (checked?.value as Base64Type) || 'auto'
  }

  function setBase64Type(type: Base64Type) {
    const radio = document.querySelector(`input[name="base64Type"][value="${type}"]`) as HTMLInputElement
    if (radio) {
      radio.checked = true
      radio.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

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
      title.textContent = '无法自动识别密文类型'
      title.style.cssText = 'margin:0 0 0.75rem;font-size:1rem;font-weight:600'

      const desc = document.createElement('p')
      desc.textContent = '请选择该密文的 Base64 类型：'
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

      btnRow.appendChild(makeBtn('标准 base64', 'standard'))
      btnRow.appendChild(makeBtn('URL-safe base64', 'urlsafe', true))
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
  }
  let G_Input: InputData | undefined;
  let currentSalt: string | undefined;
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
    return input?.value.trim();
  }
  function getPublicKey() {
    let input = document.getElementById("public") as HTMLInputElement;
    return input?.value.trim();
  }

  function setPirvateKey(str: string) {
    let input = document.getElementById("private") as HTMLInputElement;
    input.value = str;
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
      setErrMsg("请输入明文");
      return false;
    }
    try {
      let te = new TextEncoder();
      let enc = await ec.encrypt(p, te.encode(text));
      const b64type = getBase64Type()
      setCipherText(ec.base64Encode(enc, b64type === 'urlsafe' ? 1 : 0));
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

    let base64 = getCipherText();
    if (!base64) {
      setErrMsg("请输入秘文base64 或选择文件");
      return;
    }
    try {
      const detected = detectBase64Type(base64)
      let urlsafe: 0 | 1
      if (detected !== null) {
        setBase64Type(detected)
        urlsafe = detected === 'urlsafe' ? 1 : 0
      } else {
        const chosen = await showBase64TypeModal()
        setBase64Type(chosen)
        urlsafe = chosen === 'urlsafe' ? 1 : 0
      }
      let arr = ec.base64Decode(base64, urlsafe);
      let dec = await ec.decrypt(p, arr);
      let te = new TextDecoder();
      setPlainText(te.decode(dec));
    } catch (error) {
      setErrMsg(error as string);
      console.log(error);
    }
  };

  document.getElementById("generateNewKP")!.onclick = async () => {
    let kp = await ec.generateNewKeyPair();
    setPirvateKey(kp.private);
    setPublicKey(kp.public);
  };

  document.getElementById("genpubkey")!.onclick = async () => {
    let seckey = getPirvateKey();
    console.log(seckey);
    if (!seckey) {
      setErrMsg("私钥为空");
      return;
    }
    try {
      let kp = await ec.generateNewKeyPair(seckey);
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
      setErrMsg("请输入密码短语");
      return;
    }

    const salt = resolveSalt();
    if (G_Input?.prefix && !G_Input.salt) {
      phrase = `${G_Input.prefix}${phrase}`;
    }

    const kdf = resolveKdfParams();
    currentKdf = kdf;
    let kp = await pbkdf2(phrase, salt, { hash: kdf.hash, iterations: kdf.iterations });
    setPirvateKey(kp.private);
    setPublicKey(kp.public);
    showSaltInfo(salt);
  };

  document.getElementById("downloadPlain")!.onclick = async () => {
    let s = getPlainText();
    if (!s) {
      setErrMsg("文件内容为空");
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
    let s = getCipherText();
    if (!s) {
      setErrMsg("文件内容为空");
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
    let cipher = getCipherText();
    if (!cipher) {
      let t = await encryptClick();
      if (!t) {
        return;
      }
      cipher = getCipherText();
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
备份时间:${beijingtime()} ${newLine}

公钥:${getPublicKey()}    ${newLine}

网页地址:     ${newLine}
   ${location.href}         ${newLine}
数据base64:


   `;
    let mailto = `mailto:${G_Input.toEmail}?subject=${encodeURIComponent(
      G_Input.emailSubject || "备份"
    )}&body=${encodeURIComponent(msg)}`;
    console.log(mailto);
    window.open(mailto, "target", "");
  };
  document.getElementById("sendemail")!.onclick = async () => {
    let cipher = getCipherText();
    if (!cipher) {
      let t = await encryptClick();
      if (!t) {
        return;
      }
      cipher = getCipherText();
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
备份时间:${beijingtime()} ${newLine}

公钥:${getPublicKey()} ${newLine}

网页地址: ${newLine}
${location.href}  ${newLine}

数据base64: ${newLine}

   ${cipher}



   `;
    let mailto = `mailto:${G_Input.toEmail}?subject=${encodeURIComponent(
      G_Input.emailSubject || "备份"
    )}&body=${encodeURIComponent(msg)}`;
    console.log('mailto',mailto);
    window.open(mailto, "target", "");
  };

  // SHA-512 哈希并截取前33字节转为 Base64
  async function sha512ToBase64(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-512", data);
    const hashArray = new Uint8Array(hashBuffer).slice(0, 33);
    return ec.base64Encode(hashArray);
  }

  // 保存到 CloudFlare
  document.getElementById("saveToCloudflare")!.onclick = async () => {
    const pubkey = getPublicKey();
    if (!pubkey) {
      setErrMsg("公钥为空");
      return;
    }

    // 先确保有加密数据
    let cipher = getCipherText();
    if (!cipher) {
      const t = await encryptClick();
      if (!t) return;
      cipher = getCipherText();
      if (!cipher) return;
    }

    const key = encodeURIComponent(await sha512ToBase64(pubkey));
    const emailSubjectEle = document.getElementById("emailsubject") as HTMLInputElement;
    const subject = emailSubjectEle.value.trim() || "备份";

    let content = `
备份时间:${beijingtime()}
公钥:${getPublicKey()}
网页地址: ${location.href}

数据base64:

${cipher}
`;

    const noe = encodeURIComponent(subject);
    const encodedContent = encodeURIComponent(content);
    console.log('encodedContent',encodedContent);

    const url = `https://ecd1data.kr7y.workers.dev/#key=${key}&noe=${noe}&content=${encodedContent}`;
    window.open(url, "_blank");
  };

  // 从 CloudFlare 恢复
  document.getElementById("restoreFromCloudflare")!.onclick = async () => {
    const pubkey = getPublicKey();
    if (!pubkey) {
      setErrMsg("公钥为空");
      return;
    }

    const key = encodeURIComponent(await sha512ToBase64(pubkey));
    const url = `https://ecd1data.kr7y.workers.dev/list#key=${key}`;
    window.open(url, "_blank");
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
      hint.textContent =
        "如果你的公钥是通过密码短语派生的，请使用密码短语书签";
      holder?.appendChild(hint);
    }
  }

  document.getElementById("genbookmark")!.onclick = async () => {
    let pubkey = getPublicKey();
    if (!pubkey) {
      setErrMsg("公钥为空");
      return;
    }

    let prefixE = document.getElementById("prefix") as HTMLInputElement;
    let prefix = prefixE.value.trim();

    let emailEle = document.getElementById("email") as HTMLInputElement;
    let toEmail = emailEle.value.trim();

    let emailSubjectEle = document.getElementById(
      "emailsubject"
    ) as HTMLInputElement;
    let subject = emailSubjectEle.value.trim();

    await genbookmark(pubkey, toEmail, prefix, subject, getAvailableSalt(), {
      phraseHint: true,
      kdf: resolveKdfForBookmark(),
    });
  };

  document.getElementById("genbookmark2")!.onclick = async () => {
    let input = document.getElementById("keyphrase") as HTMLInputElement;
    let phrase = input?.value.trim();
    if (!phrase) {
      setErrMsg("密码短语为空");
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
    });
    showSaltInfo(saltStr);
  };

  // 默认隐藏“直接使用公钥”的书签入口，点击“更多展开”后显示
  (function initMoreExpandBookmark() {
    const moreExpand = document.getElementById("moreExpand") as HTMLElement | null;
    const genbookmark = document.getElementById("genbookmark") as HTMLElement | null;
    const explain = document.getElementById("genbookmarkExplain") as HTMLElement | null;
    if (!moreExpand || !genbookmark) return;

    moreExpand.onclick = () => {
      genbookmark.style.display = "block";
      if (explain) explain.style.display = "block";
      moreExpand.style.display = "none";
    };
  })();

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
      inputDataElement.innerText = `从链接hash带入的参数:\n ${JSON.stringify(
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



 