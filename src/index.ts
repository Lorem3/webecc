
(async function () {
const __BUILD_MOD__ = ''
const  __BUILD_TIME__ = ''
  interface InputData {
    prefix: string;
    pubkey: string;
    toEmail: string;
    emailSubject: string;
  }
  let G_Input: InputData;

  let ec = await exports.initEC();

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
      setCipherText(ec.base64Encode(enc));
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
      let arr = ec.base64Decode(base64);
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

  async function pbkdf2(phrase: string) {
    var substl = crypto.subtle;

    let keyRaw = new TextEncoder().encode(phrase);

    let key = await substl.importKey("raw", keyRaw, "PBKDF2", false, [
      "deriveBits",
    ]);
    let salt =
      "The California sea lion (Zalophus californianus) is a coastal species of eared seal native to western North America. It is one of six species of sea lion. Its natural habitat ranges from southeast Alaska to central Mexico, including the Gulf of California. This female sea lion was photographed next to a western gull in Scripps Park in the neighborhood of La Jolla in San Diego, California. [2022-04-07 wikipedia]";

    let pbkdf2 = {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: 123456,
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

    if (G_Input?.prefix) {
      phrase = `${G_Input.prefix}${phrase}`;
    }

    let kp = await pbkdf2(phrase);
    setPirvateKey(kp.private);
    setPublicKey(kp.public);
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

  let webPrivate = "yNmVrcoS5D4xMTvjAPSkZe57HZqPZoIUxznm+SqWKFo=";
  let webPublic = "dTj41nmwoLcguLpM9AntyKgg67xx6K4UAxc27CLIcFw=";

  async function genbookmark(
    pubkey: string,
    toEmail: string,
    prefix: string,
    emailSubject?: string
  ) {
    let s = { prefix, pubkey, toEmail, emailSubject };

    let jsonstring = JSON.stringify(s);
    let arr = new TextEncoder().encode(jsonstring);
    let dataBuff = await ec.encrypt(webPublic, arr);
    let data = ec.base64Encode(dataBuff);

    let bookmark = `${location.origin}${
      location.pathname
    }?t=${Date.now()}#&data=${encodeURIComponent(data)}`;

    let a = document.createElement("a");
    a.innerText = bookmark;
    a.href = bookmark;

    let holder = document.getElementById("bookmark");
    holder?.replaceChildren(a);
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

    await genbookmark(pubkey, toEmail, prefix, subject);
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

    let phrase2 = `${prefix || ""}${phrase || ""}`;

    let pubkey = (await pbkdf2(phrase2)).public;

    let emailEle = document.getElementById("email") as HTMLInputElement;
    let toEmail = emailEle.value.trim();

    let emailSubjectEle = document.getElementById(
      "emailsubject"
    ) as HTMLInputElement;
    let subject = emailSubjectEle.value.trim();

    await genbookmark(pubkey, toEmail, prefix, subject);
  };

  let btime = document.getElementById("build") as HTMLElement;
  btime.innerText = `\n${__BUILD_MOD__}\n${__BUILD_TIME__} `;

  (async function initDefaultValues() {
    console.log(location.hash);
    let search = new URLSearchParams(location.hash);

    let data = search.get("data") as string;

    let ttlog = console.log;
    ttlog({ webPrivate, webPublic });

    let plainBf = await ec.decrypt(webPrivate, ec.base64Decode(data));
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
    } else {
    }
  })();


 

})();



 