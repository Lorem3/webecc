"use strict";

!async function() {
    let G_Input, ec = await exports.initEC();
    function getPirvateKey() {
        let input = document.getElementById("private");
        return null == input ? void 0 : input.value.trim();
    }
    function getPublicKey() {
        let input = document.getElementById("public");
        return null == input ? void 0 : input.value.trim();
    }
    function setPirvateKey(str) {
        document.getElementById("private").value = str;
    }
    function setPublicKey(str) {
        document.getElementById("public").value = str;
    }
    function setPlainText(str) {
        return document.getElementById("plaintext").value = str;
    }
    function getCipherText() {
        return document.getElementById("ciphertext").value;
    }
    function getPlainText() {
        let input = document.getElementById("plaintext");
        return null == input ? void 0 : input.value;
    }
    function setErrMsg(str) {
        alert(str);
    }
    async function encryptClick() {
        getPublicKey();
        let p = getPublicKey(), text = getPlainText();
        if (!text) return setErrMsg("\u8bf7\u8f93\u5165\u660e\u6587"), !1;
        try {
            let te = new TextEncoder, enc = await ec.encrypt(p, te.encode(text));
            return str = ec.base64Encode(enc), document.getElementById("ciphertext").value = str, 
            !0;
        } catch (error) {
            return setErrMsg(error), !1;
        }
        var str;
    }
    async function pbkdf2(phrase) {
        var substl = crypto.subtle;
        let keyRaw = (new TextEncoder).encode(phrase), key = await substl.importKey("raw", keyRaw, "PBKDF2", !1, [ "deriveBits" ]), pbkdf2 = {
            name: "PBKDF2",
            hash: "SHA-256",
            iterations: 123456,
            salt: (new TextEncoder).encode("The California sea lion (Zalophus californianus) is a coastal species of eared seal native to western North America. It is one of six species of sea lion. Its natural habitat ranges from southeast Alaska to central Mexico, including the Gulf of California. This female sea lion was photographed next to a western gull in Scripps Park in the neighborhood of La Jolla in San Diego, California. [2022-04-07 wikipedia]")
        }, af = await substl.deriveBits(pbkdf2, key, 256), arrPri = new Uint8Array(af);
        ec.base64Encode(arrPri);
        let bf64 = ec.base64Encode(arrPri);
        return await ec.generateNewKeyPair(bf64);
    }
    function beijingtime() {
        return new Date(Date.now() + 288e5).toISOString().replace("T", " ").replace("Z", "") + " +0800";
    }
    function filename() {
        return beijingtime().replace(/:/g, "_").substring(0, 19);
    }
    document.getElementById("encrypt").onclick = async () => {
        await encryptClick();
    }, document.getElementById("decrypt").onclick = async () => {
        var _a;
        let p = getPirvateKey(), file = null === (_a = document.getElementById("cipherfile").files) || void 0 === _a ? void 0 : _a.item(0);
        if (file) {
            try {
                let reader = new FileReader;
                reader.readAsArrayBuffer(file), reader.onload = async () => {
                    try {
                        let aaa = new Uint8Array(reader.result), dec = await ec.decrypt(p, aaa);
                        setPlainText((new TextDecoder).decode(dec));
                    } catch (error) {
                        setErrMsg(error);
                    }
                };
            } catch (error) {
                setErrMsg(error);
            }
            return;
        }
        let base64 = getCipherText();
        if (base64) try {
            let arr = ec.base64Decode(base64), dec = await ec.decrypt(p, arr);
            setPlainText((new TextDecoder).decode(dec));
        } catch (error) {
            setErrMsg(error);
        } else setErrMsg("\u8bf7\u8f93\u5165\u79d8\u6587base64 \u6216\u9009\u62e9\u6587\u4ef6");
    }, document.getElementById("generateNewKP").onclick = async () => {
        let kp = await ec.generateNewKeyPair();
        setPirvateKey(kp.private), setPublicKey(kp.public);
    }, document.getElementById("genpubkey").onclick = async () => {
        let seckey = getPirvateKey();
        if (seckey) try {
            let kp = await ec.generateNewKeyPair(seckey);
            setPirvateKey(kp.private), setPublicKey(kp.public);
        } catch (error) {
            setErrMsg(error.toString());
        } else setErrMsg("\u79c1\u94a5\u4e3a\u7a7a");
    }, document.getElementById("genkeyfrompharse").onclick = async () => {
        let input = document.getElementById("keyphrase"), phrase = null == input ? void 0 : input.value.trim();
        if (!phrase) return void setErrMsg("\u8bf7\u8f93\u5165\u5bc6\u7801\u77ed\u8bed");
        (null == G_Input ? void 0 : G_Input.prefix) && (phrase = `${G_Input.prefix}${phrase}`);
        let kp = await pbkdf2(phrase);
        setPirvateKey(kp.private), setPublicKey(kp.public);
    }, document.getElementById("downloadPlain").onclick = async () => {
        let s = getPlainText();
        if (!s) return void setErrMsg("\u6587\u4ef6\u5185\u5bb9\u4e3a\u7a7a");
        let te = new TextEncoder, blob = new Blob([ te.encode(s) ]);
        const fileName = `dec_${filename()}.txt`, link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob), link.download = fileName, link.click(), 
        window.URL.revokeObjectURL(link.href);
    }, document.getElementById("downloadCipher").onclick = async () => {
        let s = getCipherText();
        if (!s) return void setErrMsg("\u6587\u4ef6\u5185\u5bb9\u4e3a\u7a7a");
        let cipher = ec.base64Decode(s), blob = new Blob([ cipher ]);
        const fileName = `enc_${filename()}.txt.ec`, link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob), link.download = fileName, link.click(), 
        window.URL.revokeObjectURL(link.href);
    }, document.getElementById("clearfile").onclick = async () => {
        document.getElementById("clearfileform").reset();
    }, document.getElementById("sendemail2").onclick = async () => {
        let cipher = getCipherText();
        if (!cipher) {
            if (!await encryptClick()) return;
            if (cipher = getCipherText(), !cipher) return;
        }
        let newLine = document.getElementById("newline").checked ? "          <br><br>        " : "\n";
        (0, console.log)("newLine " + newLine + "--");
        let msg = `\n   ${(null == G_Input ? void 0 : G_Input.prefix) || ""} ${newLine}\n   \u5907\u4efd\u65f6\u95f4:${beijingtime()} ${newLine}\n\n   \u516c\u94a5:${getPublicKey()}    ${newLine}\n\n   \u7f51\u9875\u5730\u5740:     ${newLine}\n   ${location.href}         ${newLine}\n\n   \u6570\u636ebase64:\n\n\n   `, mailto = `mailto:${G_Input.toEmail}?subject=${encodeURIComponent(G_Input.emailSubject || "\u5907\u4efd")}&body=${encodeURIComponent(msg)}`;
        window.open(mailto, "target", "");
    }, document.getElementById("sendemail").onclick = async () => {
        let cipher = getCipherText();
        if (!cipher) {
            if (!await encryptClick()) return;
            if (cipher = getCipherText(), !cipher) return;
        }
        let newLine = document.getElementById("newline").checked ? "          <br><br>        " : "\n";
        (0, console.log)("newLine " + newLine + "--");
        let msg = `\n   ${(null == G_Input ? void 0 : G_Input.prefix) || ""}  ${newLine}\n   \u5907\u4efd\u65f6\u95f4:${beijingtime()} ${newLine}\n\n   \u516c\u94a5:${getPublicKey()} ${newLine}\n\n   \u7f51\u9875\u5730\u5740: ${newLine}\n   ${location.href}  ${newLine}\n\n\n   \u6570\u636ebase64: ${newLine}\n\n   ${cipher}\n\n\n\n   `, mailto = `mailto:${G_Input.toEmail}?subject=${encodeURIComponent(G_Input.emailSubject || "\u5907\u4efd")}&body=${encodeURIComponent(msg)}`;
        window.open(mailto, "target", "");
    };
    let webPrivate = "yNmVrcoS5D4xMTvjAPSkZe57HZqPZoIUxznm+SqWKFo=", webPublic = "dTj41nmwoLcguLpM9AntyKgg67xx6K4UAxc27CLIcFw=";
    async function genbookmark(pubkey, toEmail, prefix, emailSubject) {
        let s = {
            prefix: prefix,
            pubkey: pubkey,
            toEmail: toEmail,
            emailSubject: emailSubject
        }, jsonstring = JSON.stringify(s), arr = (new TextEncoder).encode(jsonstring), dataBuff = await ec.encrypt(webPublic, arr), data = ec.base64Encode(dataBuff), bookmark = `${location.origin}${location.pathname}?t=${Date.now()}#&data=${encodeURIComponent(data)}`, a = document.createElement("a");
        a.innerText = bookmark, a.href = bookmark;
        let holder = document.getElementById("bookmark");
        null == holder || holder.replaceChildren(a);
    }
    document.getElementById("genbookmark").onclick = async () => {
        let pubkey = getPublicKey();
        if (!pubkey) return void setErrMsg("\u516c\u94a5\u4e3a\u7a7a");
        let prefix = document.getElementById("prefix").value.trim(), toEmail = document.getElementById("email").value.trim(), subject = document.getElementById("emailsubject").value.trim();
        await genbookmark(pubkey, toEmail, prefix, subject);
    }, document.getElementById("genbookmark2").onclick = async () => {
        let input = document.getElementById("keyphrase"), phrase = null == input ? void 0 : input.value.trim();
        if (!phrase) return void setErrMsg("\u5bc6\u7801\u77ed\u8bed\u4e3a\u7a7a");
        let prefix = document.getElementById("prefix").value.trim(), phrase2 = `${prefix || ""}${phrase || ""}`, pubkey = (await pbkdf2(phrase2)).public, toEmail = document.getElementById("email").value.trim(), subject = document.getElementById("emailsubject").value.trim();
        await genbookmark(pubkey, toEmail, prefix, subject);
    }, document.getElementById("build").innerText = "Package:Release  cmt: ecf23f1 hash: 9cd02ec1 \n 2025-03-20 10:37:59.487 +0800 ", 
    async function() {
        location.hash;
        let data = new URLSearchParams(location.hash).get("data"), ttlog = console.log;
        ttlog({
            webPrivate: webPrivate,
            webPublic: webPublic
        });
        let plainBf = await ec.decrypt(webPrivate, ec.base64Decode(data)), plain = (new TextDecoder).decode(plainBf);
        ttlog(plain);
        let jsonObj = JSON.parse(plain);
        if (jsonObj) {
            G_Input = jsonObj;
            let inputDataElement = document.getElementById("inputData");
            inputDataElement.style.display = "block", inputDataElement.innerText = `\u4ece\u94fe\u63a5hash\u5e26\u5165\u7684\u53c2\u6570:\n ${JSON.stringify(G_Input, null, "\t")}`, 
            setPublicKey(jsonObj.pubkey);
        }
    }();
}();