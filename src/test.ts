import { getSodium, randomBytes, openChaChaStreamPush, openChaChaStreamPull, aeadEncrypt, aeadDecrypt, AEAD_EMPTY_AD, AEAD_ABYTES } from './ipaste/sodium';

const TestApp = (function () {

  async function run() {
  let ec = await ECC.initEC();
  let out = document.getElementById('results')!;
  const showKeyEl = document.getElementById('showKey');
  const showIvEl = document.getElementById('showIv');
  function showKeyIv(key?: Uint8Array | null, iv?: Uint8Array | null) {
    const hex = (arr: Uint8Array) => Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    if (showKeyEl && key) showKeyEl.textContent = hex(key);
    if (showIvEl && iv) showIvEl.textContent = hex(iv);
  }
  function log(...args:any[]){
    let s = args.map(a=>typeof a==='object'?JSON.stringify(a):String(a)).join(' ');
    console.log(s);
    out.textContent += s + '\n';
  }

  let kp1 = {
    private: '6LyQlSDo10DkAkq8wRQSKQRo4ZNuNeNLB9uj6nARaVE=',
    public:  'rR/ChB02CBQWR0rUU19WQbeR7lON+kC5OQDVjzvNpCQ='
  }
  let plaintext = 'Hello, ECC test! 你好世界';
  let encBase64 = 'BAAQACAAIAA1q7Ir29TwLtgZbQRT9WLbwaKy9ldTVyEZamsqualpec0bfmcIcxA0B7EUdiej9RNhyc9DNMG2HkqW7hzQjW/wCEfU+Idh/nGpY0heVZocDzR1tfzi+U0DpPu+E4RRPDAdMVAgTz3qs0HddWfT6lQ5';

  function toHex(arr:Uint8Array){ return Array.from(arr).map((b:number)=>{let s=b.toString(16);return s.length<2?'0'+s:s}).join(' ') }

  // ========== 测试1: 老格式 gzip+blake ==========
  log('=== 测试1: 老格式 (format=0, Blake2b) gzip加密 ===')
  let plain1 = new TextEncoder().encode(plaintext);
  log('  输入明文:', plaintext)
  log('  输入base64:', ec.base64Encode(plain1))
  let enc0 = await ec.encrypt(kp1.public, plain1, true, 0);
  log('  输出密文byte[0]:', enc0[0], ' 长度:', enc0.length)
  log('  输出密文hex:', toHex(enc0))
  log('  输出密文base64:', ec.base64Encode(enc0))
  let dec0 = await ec.decrypt(kp1.private, enc0);
  let dec0Text = new TextDecoder().decode(dec0);
  log('  解密hex:', toHex(dec0))
  log('  解密base64:', ec.base64Encode(dec0))
  log('  解密结果:', dec0Text)
  log('  通过:', dec0Text === plaintext ? '✅' : '❌')

  // ========== 测试2: 老格式 raw+blake ==========
  log('')
  log('=== 测试2: 老格式 (format=0, Blake2b) 直接加密 ===')
  let enc1 = await ec.encrypt(kp1.public, plain1, false, 0);
  log('  输入明文:', plaintext)
  log('  输出密文byte[0]:', enc1[0], ' 长度:', enc1.length)
  log('  输出密文hex:', toHex(enc1))
  log('  输出密文base64:', ec.base64Encode(enc1))
  let dec1 = await ec.decrypt(kp1.private, enc1);
  let dec1Text = new TextDecoder().decode(dec1);
  log('  解密hex:', toHex(dec1))
  log('  解密结果:', dec1Text)
  log('  通过:', dec1Text === plaintext ? '✅' : '❌')

  // ========== 测试3: 新格式 gzip+sha512 ==========
  log('')
  log('=== 测试3: 新格式 (format=1, HMAC-SHA512) gzip加密 ===')
  let enc2 = await ec.encrypt(kp1.public, plain1, true, 1);
  log('  输入明文:', plaintext)
  log('  输出密文byte[0]:', enc2[0], ' 长度:', enc2.length)
  log('  输出密文hex:', toHex(enc2))
  log('  输出密文base64:', ec.base64Encode(enc2))
  let dec2 = await ec.decrypt(kp1.private, enc2);
  let dec2Text = new TextDecoder().decode(dec2);
  log('  解密hex:', toHex(dec2))
  log('  解密结果:', dec2Text)
  log('  通过:', dec2Text === plaintext ? '✅' : '❌')

  // ========== 测试4: 新格式 raw+sha512 ==========
  log('')
  log('=== 测试4: 新格式 (format=1, HMAC-SHA512) 直接加密 ===')
  let enc3 = await ec.encrypt(kp1.public, plain1, false, 1);
  log('  输入明文:', plaintext)
  log('  输出密文byte[0]:', enc3[0], ' 长度:', enc3.length)
  log('  输出密文hex:', toHex(enc3))
  log('  输出密文base64:', ec.base64Encode(enc3))
  let dec3 = await ec.decrypt(kp1.private, enc3);
  let dec3Text = new TextDecoder().decode(dec3);
  log('  解密hex:', toHex(dec3))
  log('  解密结果:', dec3Text)
  log('  通过:', dec3Text === plaintext ? '✅' : '❌')

  let encBase64_2 = 'BAAQACAAIAAklMYcyU7p6dHXjFVu5YX6ImGKJ4w/vPGrMn3yeaEIFeOPcoT4EHKFO8bYEHS4msqkWT/fb8swwd1CTtfI+ayjCEPohAtwKMhOIunFCpIQXI7nPa3fTDb/RCCV5T4zNQmLp5Nned4wCyYNJHEBZA/D';

  // ========== 测试5: 解密外部老格式密文 ==========
  log('')
  log('=== 测试5: 解密外部老格式密文 ===')
  let extPlain = '123abc123abc';
  let extData = ec.base64Decode(encBase64);
  log('  输入base64:', encBase64)
  log('  输入hex:', toHex(extData))
  log('  输入byte[0]:', extData[0], ' 长度:', extData.length)
  try {
    let decExt = await ec.decrypt(kp1.private, extData);
    let decExtText = new TextDecoder().decode(decExt);
    log('  解密hex:', toHex(decExt))
    log('  解密base64:', ec.base64Encode(decExt))
    log('  解密结果:', decExtText)
    log('  通过:', decExtText === extPlain ? '✅' : '❌')
  } catch(e) {
    log('  解密失败:', e)
  }

  // ========== 测试6: 解密第二条外部密文 ==========
  log('')
  log('=== 测试6: 解密第二条外部老格式密文 ===')
  let extData2 = ec.base64Decode(encBase64_2);
  log('  输入base64:', encBase64_2)
  log('  输入hex:', toHex(extData2))
  log('  输入byte[0]:', extData2[0], ' 长度:', extData2.length)
  try {
    let decExt2 = await ec.decrypt(kp1.private, extData2);
    let decExt2Text = new TextDecoder().decode(decExt2);
    log('  解密hex:', toHex(decExt2))
    log('  解密base64:', ec.base64Encode(decExt2))
    log('  解密结果:', decExt2Text)
  } catch(e) {
    log('  解密失败:', e)
  }

  // ========== 测试7: 格式隔离(篡改byte[0]) ==========
  log('')
  log('=== 测试8: 格式隔离 (篡改新格式byte[0] → MAC失败) ===')
  let enc2_tampered = new Uint8Array(enc2)
  enc2_tampered[0] = 4
  log('  篡改后byte[0]:', enc2_tampered[0], '(强制Blake2b路径)')
  try {
    await ec.decrypt(kp1.private, enc2_tampered);
    log('  失败: 应抛异常但未抛')
  } catch(e) {
    log('  ✅', e)
  }

  // ========== 测试7: byte[0] 编码验证 ==========
  log('')
  log('=== 测试9: byte[0] 编码验证 ===')
  log('  老格式 gzip+blake  byte[0] =', enc0[0], '(期望4)', enc0[0]===4?'✅':'❌')
  log('  老格式 raw+blake   byte[0] =', enc1[0], '(期望5)', enc1[0]===5?'✅':'❌')
  log('  新格式 gzip+sha512 byte[0] =', enc2[0], '(期望12)', enc2[0]===12?'✅':'❌')
  log('  新格式 raw+sha512  byte[0] =', enc3[0], '(期望13)', enc3[0]===13?'✅':'❌')

  // ========== 测试10: 短语生成密钥对验证 ==========
  log('')
  log('=== 测试10: 短语生成密钥对验证 ===')

  async function deriveKeyFromPhrase(phrase: string): Promise<Uint8Array> {
    const substl = crypto.subtle;
    const keyRaw = new TextEncoder().encode(phrase);
    const key = await substl.importKey('raw', keyRaw, 'PBKDF2', false, ['deriveBits']);
    const salt = 'The California sea lion (Zalophus californianus) is a coastal species of eared seal native to western North America. It is one of six species of sea lion. Its natural habitat ranges from southeast Alaska to central Mexico, including the Gulf of California. This female sea lion was photographed next to a western gull in Scripps Park in the neighborhood of La Jolla in San Diego, California. [2022-04-07 wikipedia]';
    const pbkdf2 = {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: 123456,
      salt: new TextEncoder().encode(salt),
    };
    const af = await substl.deriveBits(pbkdf2, key, 256);
    return new Uint8Array(af);
  }

  // 测试短语 "1"
  const phrase1 = '1';
  const key1 = await deriveKeyFromPhrase(phrase1);
  const kp_phrase1 = await ec.generateNewKeyPair(ec.base64Encode(key1));
  const expectedPub1 = 'rWCkvGnhH2lhzPyvexc1f55+vg7H0f4YDFz4PU2u/jg=';
  const expectedPriv1 = 'KBPQElULJTMprpBREalJfo4QiM+qnDIwWUZAGZOmfnY=';
  log('  短语 "1":')
  log('    公钥:', kp_phrase1.public, kp_phrase1.public === expectedPub1 ? '✅' : '❌')
  log('    私钥:', kp_phrase1.private, kp_phrase1.private === expectedPriv1 ? '✅' : '❌')

  // 测试短语 "abc222"
  const phrase2 = 'abc222';
  const key2 = await deriveKeyFromPhrase(phrase2);
  const kp_phrase2 = await ec.generateNewKeyPair(ec.base64Encode(key2));
  const expectedPub2 = 'aZTV3Mf57P00chbhZbqd1koqJo3HWpXxHHmhv/oxW14=';
  const expectedPriv2 = 'qN5ColpRMzOod6C2MA9DYqV1KJZWMmDQYY6ziAqoK2U=';
  log('  短语 "abc222":')
  log('    公钥:', kp_phrase2.public, kp_phrase2.public === expectedPub2 ? '✅' : '❌')
  log('    私钥:', kp_phrase2.private, kp_phrase2.private === expectedPriv2 ? '✅' : '❌')

  // ========== 测试11: CBC 解密兼容性测试 ==========
  log('')
  log('=== 测试11: CBC 解密兼容性测试 ===')
  const cbcCipherB64 = 'DAAQACAAIADMod0xzoR8336Q9cnmmu9kZyFOXgq3IKwj74J/vn/zJNxe2k/1jfFszUJqBDCFr7qnOFtMX/JjccJx/+KRZRYzvaOWNwUB59fv3rnenlj5J2XZzlfFyNahrFYWqU3kJo8tnXTiMx31nNy2d6WAETlU'
  const cbcPrivKey = 'SLddu5s1gMMY3mGTL8tIL2K53eFkyUxknXdVRgqNWEM='
  const cbcData = ec.base64Decode(cbcCipherB64)
  log('  输入byte[0]:', cbcData[0], '(bit1=' + ((cbcData[0] & 2) >> 1) + ', header IV长度=' + (cbcData[2] | (cbcData[3] << 8)) + ')')
  try {
    const decCbc = await ec.decrypt(cbcPrivKey, cbcData)
    log('  解密hex:', toHex(decCbc))
    log('  解密base64:', ec.base64Encode(decCbc))
    log('  解密长度:', decCbc.length)
    log('  ✅ CBC 解密成功')
  } catch(e) {
    log('  ❌ CBC 解密失败:', e)
  }

  function eqBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  try {
    const na = await getSodium();
    const toHexC = (arr: Uint8Array) => Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')

    // ========== 测试12: 流式 == 一次性 XChaCha20-Poly1305 ==========
    log('')
    log('=== 测试12: crypto_aead_xchacha20poly1305_ietf 流式与一次性一致 ===')
    const ssKey = randomBytes(na, 32);
    const ssPtText = [
      "The California sea lion (Zalophus californianus) is a coastal eared seal native to western North America.",
      "Its natural habitat ranges from southeast Alaska to central Mexico, including the Gulf of California.",
      "Sea lions are known for their intelligence, playfulness, and noisy barking; they gather in colonies on docks and beaches.",
      "Adult males can weigh over 350 kilograms and develop a distinctive sagittal crest as they mature.",
      "They hunt fish and cephalopods, diving repeatedly and using whiskers to sense prey in murky water.",
      "Conservation status improved after hunting bans, though they still face entanglement, pollution, and climate-driven prey shifts.",
      "Researchers track movement with tags and study how shipping noise and warming oceans affect foraging and breeding.",
      "This long plaintext is used to exercise multi-chunk crypto_aead_xchacha20poly1305_ietf push/pull without loading a one-shot AEAD path.",
      "附加中文段落：流式加密按块推送，末尾一个 16 字节 tag，密文须与一次性 encrypt 完全一致。",
      "再补一段内容以保证长度足够：0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz !@#$%^&*()_+-=[]{}|;:',.<>/?~`",
    ].join(' ');
    const ssPt = new TextEncoder().encode(ssPtText);

    log('  --- 加密 ---')
    log('  key hex:', toHexC(ssKey))
    log('  明文长度:', ssPt.length)
    const ssEnc = openChaChaStreamPush(na, ssKey);
    log('  iv hex:', toHexC(ssEnc.header))
    showKeyIv(ssKey, ssEnc.header)
    const chunkN = 4;
    const chunkSize = Math.ceil(ssPt.length / chunkN);
    const cipherChunks: Uint8Array[] = [];
    for (let i = 0; i < chunkN; i++) {
      const start = i * chunkSize;
      if (start >= ssPt.length) break;
      const end = Math.min(start + chunkSize, ssPt.length);
      cipherChunks.push(ssEnc.push(ssPt.subarray(start, end), end >= ssPt.length));
    }
    const ssCtLen = cipherChunks.reduce((n, c) => n + c.length, 0);
    const ssCt = new Uint8Array(ssCtLen);
    { let o = 0; for (const c of cipherChunks) { ssCt.set(c, o); o += c.length; } }
    const oneShotCt = aeadEncrypt(na, ssPt, AEAD_EMPTY_AD, ssEnc.header, ssKey);
    log('  密文 hex:', toHexC(ssCt))
    log('  分块数:', cipherChunks.length, '末尾 tag:', AEAD_ABYTES, '密文长度:', ssCt.length)
    log('  流式==一次性密文:', eqBytes(ssCt, oneShotCt) ? '✅' : '❌')

    log('  --- 解密 ---')
    log('  key hex:', toHexC(ssKey))
    log('  iv hex:', toHexC(ssEnc.header))
    // 流式拉块缓冲，末块一次性 wasm decrypt（与 aeadDecrypt 一致）
    const ssDec = openChaChaStreamPull(na, ssKey, ssEnc.header);
    const bodyLen = ssCt.length - AEAD_ABYTES;
    let off = 0;
    const pullStep = Math.ceil(Math.max(bodyLen, 1) / chunkN);
    let ssOut = new Uint8Array(0);
    if (bodyLen === 0) {
      ssOut = ssDec.pull(ssCt, true).message;
    } else {
      while (off < bodyLen) {
        const end = Math.min(off + pullStep, bodyLen);
        const last = end >= bodyLen;
        if (last) {
          const chunk = new Uint8Array(end - off + AEAD_ABYTES);
          chunk.set(ssCt.subarray(off, end), 0);
          chunk.set(ssCt.subarray(bodyLen), end - off);
          ssOut = ssDec.pull(chunk, true).message;
        } else {
          ssDec.pull(ssCt.subarray(off, end), false);
        }
        off = end;
      }
    }
    const oneShotPt = aeadDecrypt(na, oneShotCt, AEAD_EMPTY_AD, ssEnc.header, ssKey);
    const ssOutText = new TextDecoder().decode(ssOut);
    log('  明文:', ssOutText)
    log('  流式解密==明文:', ssOutText === ssPtText ? '✅' : '❌')
    log('  一次性解密==明文:', eqBytes(oneShotPt, ssPt) ? '✅' : '❌')
    log('  流式解密==一次性解密:', eqBytes(ssOut, oneShotPt) ? '✅' : '❌')
    log('  加密引擎: libsodium.wasm crypto_aead_xchacha20poly1305_ietf')

    // ========== 测试13: XChaCha20-Poly1305 往返 / 空消息 / 篡改 ==========
    log('')
    log('=== 测试13: crypto_aead_xchacha20poly1305_ietf 往返与篡改 ===')
    const rndKey = randomBytes(na, 32);
    const rndPt = new TextEncoder().encode(ssPtText + ' | ' + plaintext);
    const enc1 = openChaChaStreamPush(na, rndKey);
    log('  key hex:', toHexC(rndKey))
    log('  iv hex:', toHexC(enc1.header))
    showKeyIv(rndKey, enc1.header)
    const rndParts: Uint8Array[] = [];
    const step = Math.ceil(rndPt.length / 3);
    for (let i = 0; i < rndPt.length; i += step) {
      const end = Math.min(i + step, rndPt.length);
      rndParts.push(enc1.push(rndPt.subarray(i, end), end >= rndPt.length));
    }
    const rndCt = new Uint8Array(rndParts.reduce((n, c) => n + c.length, 0));
    { let o = 0; for (const c of rndParts) { rndCt.set(c, o); o += c.length; } }
    log('  密文 hex:', toHexC(rndCt))
    const oneRnd = aeadEncrypt(na, rndPt, AEAD_EMPTY_AD, enc1.header, rndKey);
    log('  流式==一次性:', eqBytes(rndCt, oneRnd) ? '✅' : '❌')
    const dec1 = openChaChaStreamPull(na, rndKey, enc1.header);
    const { message: rndBack } = dec1.pull(rndCt, true);
    const rndOverhead = rndCt.length - rndPt.length;
    log('  随机往返:', eqBytes(rndBack, rndPt) ? '✅' : '❌',
      'overhead', rndOverhead, '(期望' + AEAD_ABYTES + ')')

    const encEmpty = openChaChaStreamPush(na, rndKey);
    const emptyCt = encEmpty.push(new Uint8Array(0), true);
    const emptyOne = aeadEncrypt(na, new Uint8Array(0), AEAD_EMPTY_AD, encEmpty.header, rndKey);
    const decEmpty = openChaChaStreamPull(na, rndKey, encEmpty.header);
    const emptyPt = decEmpty.pull(emptyCt, true);
    log('  空消息:', emptyCt.length === AEAD_ABYTES && eqBytes(emptyCt, emptyOne) && emptyPt.message.length === 0 ? '✅' : '❌')

    const badCt = rndCt.slice();
    badCt[0] ^= 1;
    try {
      openChaChaStreamPull(na, rndKey, enc1.header).pull(badCt, true);
      log('  密文篡改: 应失败但未失败 ❌')
    } catch {
      log('  密文篡改: ✅ 拒绝')
    }

    // ========== 测试14: XChaCha20-Poly1305 流式 + ECDH 头 0x0F ==========
    log('')
    log('=== 测试14: crypto_aead_xchacha20poly1305_ietf 流式 + ECDH 头 ===')
    const keys = await ec.deriveEcdhStreamKeys(kp1.public);
    const ssPush = openChaChaStreamPush(na, keys.streamKey);
    log('  key hex:', toHexC(keys.streamKey))
    log('  iv hex:', toHexC(ssPush.header))
    showKeyIv(keys.streamKey, ssPush.header)
    log('  header 长度:', ssPush.header.length, '(期望24)', ssPush.header.length === 24 ? '✅' : '❌')
    log('  abytes:', ssPush.abytes, '(期望16)', ssPush.abytes === 16 ? '✅' : '❌')
    const head = await ec.assembleEcdhStreamHead(ssPush.header, keys.tmpPub, keys.macKey);
    log('  Layer1 byte[0]:', head[0], '(期望15/0x0F)', head[0] === 0x0F ? '✅' : '❌')
    log('  Layer1 长度:', head.length, '(期望96)', head.length === 96 ? '✅' : '❌')
    const opened = await ec.openEcdhStreamHead(kp1.private, head);
    log('  打开头 streamKey:', eqBytes(opened.streamKey, keys.streamKey) ? '✅' : '❌')
    log('  打开头 header:', eqBytes(opened.ssHeader, ssPush.header) ? '✅' : '❌')
    log('  解密 key hex:', toHexC(opened.streamKey))
    log('  解密 iv hex:', toHexC(opened.ssHeader))

    const parts = [
      new Uint8Array(1024).fill(0x11),
      new Uint8Array(777).fill(0x22),
      new TextEncoder().encode('last-chunk 你好'),
    ];
    const allPlain = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    { let o = 0; for (const p of parts) { allPlain.set(p, o); o += p.length; } }
    const ciphers: Uint8Array[] = [];
    for (let i = 0; i < parts.length; i++) {
      ciphers.push(ssPush.push(parts[i], i === parts.length - 1));
    }
    const streamBody = new Uint8Array(ciphers.reduce((n, c) => n + c.length, 0));
    { let o = 0; for (const c of ciphers) { streamBody.set(c, o); o += c.length; } }
    const oneBody = aeadEncrypt(na, allPlain, AEAD_EMPTY_AD, ssPush.header, keys.streamKey);
    log('  每块密文长度:', ciphers.map(c => c.length).join(','))
    log('  流式body==一次性:', eqBytes(streamBody, oneBody) ? '✅' : '❌')
    log('  总长=明文+16:', streamBody.length === allPlain.length + 16 ? '✅' : '❌')

    const ssPull = openChaChaStreamPull(na, opened.streamKey, opened.ssHeader);
    const { message: plainAll } = ssPull.pull(streamBody, true);
    log('  分块往返:', eqBytes(plainAll, allPlain) ? '✅' : '❌')
    log('  一次性解密:', eqBytes(aeadDecrypt(na, oneBody, AEAD_EMPTY_AD, opened.ssHeader, opened.streamKey), allPlain) ? '✅' : '❌')

    const badChunk = streamBody.slice();
    badChunk[0] ^= 1;
    try {
      openChaChaStreamPull(na, opened.streamKey, opened.ssHeader).pull(badChunk, true);
      log('  分块篡改: 应失败但未失败 ❌')
    } catch {
      log('  分块篡改: ✅ 拒绝')
    }
    const badHead = head.slice();
    badHead[40] ^= 1;
    try {
      await ec.openEcdhStreamHead(kp1.private, badHead);
      log('  头 MAC 篡改: 应失败但未失败 ❌')
    } catch (e) {
      log('  头 MAC 篡改: ✅', e)
    }
  } catch (e) {
    log('')
    log('=== XChaCha20-Poly1305 测试失败 ===')
    log('  ❌', e)
  }

  // ========== 测试15: hash-wasm 流式 HMAC-SHA512 == WebCrypto ==========
  log('')
  log('=== 测试15: hash-wasm 流式 HMAC-SHA512 == WebCrypto ===')
  try {
    const { createHMAC, createSHA512 } = await import('hash-wasm');
    const salt = 'test-salt-hmac';
    const keyBytes = new TextEncoder().encode('phash' + salt);
    const chunks = [
      new Uint8Array(1024).fill(0x41),
      new TextEncoder().encode('middle chunk 你好 HMAC-SHA512'),
      new Uint8Array(777).fill(0x5a),
      new Uint8Array(0),
      new TextEncoder().encode('tail'),
    ];
    const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    { let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; } }

    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyBytes, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
    );
    const webFull = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, all));

    const hmac = await createHMAC(createSHA512(), keyBytes);
    hmac.init();
    for (const c of chunks) hmac.update(c);
    const wasmFull = hmac.digest('binary');

    log('  明文总长:', all.length, '分块数:', chunks.length)
    log('  WebCrypto digest hex:', toHex(webFull.slice(0, 16)), '...')
    log('  hash-wasm digest hex:', toHex(wasmFull.slice(0, 16)), '...')
    log('  全量 64B 一致:', eqBytes(webFull, wasmFull) ? '✅' : '❌')
    log('  前 32B（phash）一致:', eqBytes(webFull.slice(0, 32), wasmFull.slice(0, 32)) ? '✅' : '❌')

    const hmacEmpty = await createHMAC(createSHA512(), keyBytes);
    hmacEmpty.init();
    hmacEmpty.update(new Uint8Array(0));
    const wasmEmpty = hmacEmpty.digest('binary');
    const webEmpty = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new Uint8Array(0)));
    log('  空消息一致:', eqBytes(webEmpty, wasmEmpty) ? '✅' : '❌')

    // 逐字节流式 vs 一次 update
    const hmacByte = await createHMAC(createSHA512(), keyBytes);
    hmacByte.init();
    for (let i = 0; i < all.length; i++) hmacByte.update(all.subarray(i, i + 1));
    const wasmByte = hmacByte.digest('binary');
    log('  逐字节流式==WebCrypto:', eqBytes(webFull, wasmByte) ? '✅' : '❌')

    const allOk = eqBytes(webFull, wasmFull)
      && eqBytes(webFull.slice(0, 32), wasmFull.slice(0, 32))
      && eqBytes(webEmpty, wasmEmpty)
      && eqBytes(webFull, wasmByte);
    log('  通过:', allOk ? '✅' : '❌')
  } catch (e) {
    log('  ❌', e)
  }

  }

  return { run };
})();
TestApp.run();
