
# 这是用来做什么的？
定期导出密码管理器的密钥加密备份，发送到邮箱。
**所有操作在浏览器本地进行，无服务器参与。**

> 以前搞丢过bitwarden的两步验证，只能删掉账号。
> 定期导出管理器的密钥
> 将公钥放到链接里面，方便每次备份，不用每次输入短语



  
# 带入参数

通过页面的一对密钥对 解密hash里面的data,解密成一个json
```
私钥 yNmVrcoS5D4xMTvjAPSkZe57HZqPZoIUxznm+SqWKFo=
公钥 dTj41nmwoLcguLpM9AntyKgg67xx6K4UAxc27CLIcFw=
```
json结构
```
{
    prefix:string  
    pubkey:string
    toEmail:string
}
```
|字段|说明|其他|
|-|-|-|
|prefix|密码短语的前缀(建议邮箱后面加上`#`)，和密码短语一起生成密钥对|可为空|
|pubkey|传入的默认公钥，用来加密|
|toEmail|生成mailto链接，发送加密的结果作为备份|
|emailSubject|邮件主题|



## 通过hash 带入参数

[https://webecc.pages.dev/#&data=BAAQACAAIAB3v4SZnpkL7YvNQK4Up1anEtK61zy7RWgCxTKz1jpp9oH8QLfqdbqAZRFcNnHvqYHnqfx91GT1hvch7LdnMM6c88W6QV5V56fpWLcXU5jXVWv%2BiZY4P3INk%2FJw6o5NtVJhYTHFK0UcXb7hLdx7GCaTIgWg0Zon3%2B9BIEaspj8c166yRsjD5TeZb5IWUjzPUGaxb1vQ3FCQH%2FRE6MLcf7S2hhMUT2yJzXaoqJIUMOnHtbcPmY4BpN6trjItVlE0rJkZsreBRybrcrMXyzdasklMLpk2LVcY5G4noZDRnY93nESSKkerOv%2Fs4nz82fvJjEzY%2F%2FRcAoy7JP%2BgOlvXSsUp](https://webecc.pages.dev/#&data=BAAQACAAIAB3v4SZnpkL7YvNQK4Up1anEtK61zy7RWgCxTKz1jpp9oH8QLfqdbqAZRFcNnHvqYHnqfx91GT1hvch7LdnMM6c88W6QV5V56fpWLcXU5jXVWv%2BiZY4P3INk%2FJw6o5NtVJhYTHFK0UcXb7hLdx7GCaTIgWg0Zon3%2B9BIEaspj8c166yRsjD5TeZb5IWUjzPUGaxb1vQ3FCQH%2FRE6MLcf7S2hhMUT2yJzXaoqJIUMOnHtbcPmY4BpN6trjItVlE0rJkZsreBRybrcrMXyzdasklMLpk2LVcY5G4noZDRnY93nESSKkerOv%2Fs4nz82fvJjEzY%2F%2FRcAoy7JP%2BgOlvXSsUp)


# 格式说明


## 结构
|2字节|2字节|2字节|2字节|IV|MAC|随机公钥|加密数据|
|-|-|-|-|-|-|-|-|
 
`下面short都是小端模式`

+ 1-2字节short 意义
  - 4：老格式，先gzip后加密 (Blake2b)
  - 5：老格式，直接加密 (Blake2b)
  - 12：新格式，直接加密 (HMAC-SHA512)
  - 13：新格式，先gzip后加密 (HMAC-SHA512)

+ 3-4字节的short值表示 iv的长度 ，16  
+ 5-6字节的short值表示 mac校验hash的长度 32
+ 7-8字节 字节表示临时公钥长度 ，32
+ IV   // 随机生成
+ MAC  ，//最后计算生成
+ tmpPubKey //随机生成公钥私钥，私钥(tmpSecKey)使用后丢弃
+ EncryptData


## 老格式 (format=0, Blake2b)

```
生成临时公钥私钥 tmpSecKey , tmpPubKey

sharedX（32 byte）= publickKey • tmpSecKey 

buffer[96];
copy sharedX  => buffer[0..31]

/**
* 下面公钥按照小端模式比较，先比较高位置，再比较低位
*/
if tmpPubKey > publickKey  
    copy publickKey => buffer[32...63]
    copy tmpPubKey => buffer[64...95]   
else  
    copy publickKey => buffer[32...63]
    copy tmpPubKey => buffer[64...95]    
end  

利用hash算法 blake2b 生成64字节长度digest
digest = blake2b(buffer)

其中 digest[0..31] 作为 AES-CBC 的密钥 aesKey,使用IV 一起加密密钥生成 加密数据 EncryptData

其中 digest[32,63]作为计算mac的密钥 HKEY，输出32字节数据

也是采用blake2b,指定输出32字节，key = HKEY

mac = blake2b(IV + tmpPubKey + EncryptData)


```


## 新格式 (format=1, HMAC-SHA512)

```
生成临时公钥私钥 tmpSecKey , tmpPubKey

sharedX（32 byte）= publickKey • tmpSecKey 

buffer[96];
copy sharedX  => buffer[0..31]

/**
* 下面公钥按照小端模式比较，先比较高位置，再比较低位
*/
if tmpPubKey > publickKey  
    copy publickKey => buffer[32...63]
    copy tmpPubKey => buffer[64...95]   
else  
    copy publickKey => buffer[32...63]
    copy tmpPubKey => buffer[64...95]    
end  

利用 SHA-512 生成64字节长度digest
digest = SHA-512(buffer)

其中 digest[0..31] 作为 AES-CBC 的密钥 aesKey,使用IV 一起加密密钥生成 加密数据 EncryptData

其中 digest[32,63]作为计算mac的密钥 HKEY，输出32字节数据

采用 HMAC-SHA512,输出32字节，key = HKEY

mac = HMAC-SHA512(HKEY, IV + tmpPubKey + EncryptData)


```


# 独立加密模块 (enc.ts)

独立的加密模块，使用 Web Crypto API 实现，不依赖 curve25519.js。

## 特性
- 纯 Web Crypto API 实现
- 支持 X25519 ECDH 密钥交换
- 支持 gzip 压缩
- 支持 SHA-512 密钥派生
- 支持 HMAC-SHA512 MAC 校验
- 支持 AES-CBC 加密
- 输入输出均为 Uint8Array

## 使用方法

```typescript
// 初始化
const enc = await initEnc();

// 加密
const pubKey = new Uint8Array([...]); // 32字节公钥
const msg = new TextEncoder().encode('Hello');
const encrypted = await enc.encrypt(pubKey, msg);

// 解密 (使用 EC 类)
const privKey = '...'; // base64私钥
const decrypted = await ec.decrypt(privKey, encrypted);
```


# 根据密码短语生成密钥

步骤
1. prefix(如果有) + 密码短语  作为  key  = prefix + phrase
2. PBKDF2(key) 生成32 字作为私钥, secKey = PBKDF2(key)
3. 根据私钥生成 密钥对

PBKDF2 参数

|PBKDF2参数|value|
|-|-|
|salt|The California sea lion (Zalophus californianus) is a coastal species of eared seal native to western North America. It is one of six species of sea lion. Its natural habitat ranges from southeast Alaska to central Mexico, including the Gulf of California. This female sea lion was photographed next to a western gull in Scripps Park in the neighborhood of La Jolla in San Diego, California. [2022-04-07 wikipedia]|
|iteration|123456|
|hash|SHA-256|
|outLen|256bit|
