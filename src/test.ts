
const TestApp = (function () {

  async function run() {
  let ec = await ECC.initEC();
  let out = document.getElementById('results')!;
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

  }

  return { run };
})();
TestApp.run();
