
var subtle = crypto.subtle

class GZip{
    async gzip(inputarr:Uint8Array){ 
        
         // 创建包含输入数据的可读流
        const inputStream = new ReadableStream({
            start(controller) {
            controller.enqueue(inputarr);
            controller.close();
            }
        });
        const gzs = new CompressionStream('gzip');
        const compressedStream = inputStream.pipeThrough(gzs);

        const reader = compressedStream.getReader();
        let chunks: Uint8Array[] = [];
        console.log(inputarr.length)
        while (true) {
            try {
                const { done, value } = await reader.read();  
                console.log(value?.length)
                if (done) break;
                if (value !== undefined) chunks.push(value);    
            } catch (error) {
                console.log(error)
                break
            }
        }

        let len = chunks.reduce((s,t)=> s + t.length,0)

        var gzip = new Uint8Array(len)
        var idx = 0;
        chunks.forEach(bytes=>{
            bytes.forEach((v)=>{
                gzip[idx ++] = v 
            })
        })

        return gzip
    }
    async ungzip(inputarr:Uint8Array){
        
         // 创建包含输入数据的可读流
         const inputStream = new ReadableStream({
            start(controller) {
            controller.enqueue(inputarr);
            controller.close();
            }
        });
        const gzs = new DecompressionStream('gzip');
        const compressedStream = inputStream.pipeThrough(gzs);

        const reader = compressedStream.getReader();
        let chunks: Uint8Array[] = [];
        console.log(inputarr.length)
        while (true) {
            try {
                const { done, value } = await reader.read();  
                console.log(value?.length)
                if (done) break;
                if (value !== undefined) chunks.push(value);    
            } catch (error) {
                console.log(error)
                break
            }
        }

        let len = chunks.reduce((s,t)=> s + t.length,0)
        var plain  = new Uint8Array(len)
        var idx = 0;
        chunks.forEach(bytes=>{
            bytes.forEach((v)=>{
                plain[idx ++] = v 
            })
        })

        return plain
    }
    
}

class EC{
    zlib :GZip
    constructor(){
        this.zlib = new GZip

    }
    
    toHex(arr:Uint8Array){
        let strArr = []  as  string[]
        arr.forEach(e=>{let s = e.toString(16) ;strArr.push(s.length == 1 ? '0' + s : s)})
        return strArr.join("")
    }
    async genRandomKeyBuffer(length:number = 32):Promise<Uint8Array>{
        let p = {
            name:'HMAC',
            hash:'SHA-512',
            length:256
        }
        let keyObj = await subtle.generateKey(p,true,['sign']) as  CryptoKey
        let keyBf = await subtle.exportKey('raw',keyObj);
        keyObj = await subtle.importKey('raw',keyBf,'PBKDF2',false,['deriveKey'])
        
        let salt = crypto.getRandomValues(new Uint8Array(64));
        let pbkdf2 = {
            name:"PBKDF2",
            hash:"SHA-512",
            iterations:10,
            salt:  salt.buffer  
        }
        let dk = {
            name: "HMAC",
            hash: "SHA-512",
            length:length * 8,
        }
        let result  = await subtle.deriveKey(pbkdf2,keyObj,dk,true,['sign']);

        return new Uint8Array(await subtle.exportKey('raw',result))
    }

    base64Encode(arr:Uint8Array,urlsafe = 0):string{
        let r = base64js.fromByteArray(arr,76)
        if (urlsafe) {
            r = r.replace(/\+/g, '-')
            r = r.replace(/\//g, '_')
            r = r.replace(/=/g, '')
        }
        return r
    }
    base64Decode(str:string,urlsafe = 0):Uint8Array{
        if (urlsafe) {
            str = str.replace(/-/g, '+')
            str = str.replace(/_/g, '/')
            str = str.replace(/=/g, '')
        }
        return base64js.toByteArray(str)
    }
    async generateNewKeyPair(seckey ?:string): Promise<{private:string,public:string}>{
        let a = null
        if (seckey) {
            a = this.base64Decode(seckey)
            if (a?.length != 32) {
                throw "private key length must be 32"
            }
        }else{
            a = await this.genRandomKeyBuffer();
        }
        
        let kp = X25519.generateKeyPair(a);
        let kp2 = {
            public:base64js.fromByteArray(kp.public),
            private:base64js.fromByteArray(kp.private)
        }
        return kp2
    }
    async decrypt(privateKeyB64:string,data:Uint8Array){
        if (!(data[0] == 4 || data[0] == 5) || data?.length < 88) {
            throw "data format not support"
        }
        let privateKey = base64js.toByteArray(privateKeyB64);
        if (privateKey.length != 32) {
            throw "privateKey length must be 32"
        }

        let iv = data.subarray(8,24)
        let mac = data.subarray(24,56);
        let tmpPub = data.subarray(56,88);
        let enc = data.subarray(88)
        let dh = X25519.sharedKey(privateKey,tmpPub);

        let kp = X25519.generateKeyPair(privateKey);
        let hash64 = new Uint8Array(64);
        this.hashDH(dh,kp.public,tmpPub,hash64);

        
        let b2b = blake2b.blake2bInit(32,hash64.subarray(32,64));

 
        blake2b.blake2bUpdate(b2b,iv)
        blake2b.blake2bUpdate(b2b,tmpPub)
        blake2b.blake2bUpdate(b2b,enc);

        let mac2 = blake2b.blake2bFinal(b2b)
        for (let i = 0; i < 32; i++) {
            if (mac[i] != mac2[i]) {
                throw "MAC NOT FIT"
            }
        }
 

        let dec = await this.aesDecrypt(hash64.subarray(0,32),iv,enc);

        if (data[0] == 4) {
            
            return  await this.zlib.ungzip(dec)
        }

        return dec
    }

    private hashDH(dh:Uint8Array,pub1:Uint8Array,pub2:Uint8Array,dh64:Uint8Array){

        let shared96 = new Uint8Array(96)
        dh.forEach((e ,i)=>{
            shared96[i] = e;
        })
        /// compare pub
        let flag = 0;
        for (let i = 31; i >= 0; --i) {
            const element = pub1[i];
            const element2 = pub2[i];
            if (element < element2) {
                flag = -1;
                break;
            }else if(element > element2){
                flag = 1;
                break;
            }
        }
        if (flag == -1) {
            pub1.forEach((e ,i)=>{
                shared96[i + 32] = e;
            })
            pub2.forEach((e ,i)=>{
                shared96[i + 64] = e;
            })
        }else{
            pub2.forEach((e ,i)=>{
                shared96[i + 32] = e;
            })
            pub1.forEach((e ,i)=>{
                shared96[i + 64] = e;
            })
        }

        let b2b = blake2b.blake2bInit(64);
        blake2b.blake2bUpdate(b2b,shared96)
        let r = blake2b.blake2bFinal(b2b)
        r.forEach((e,i)=>{dh64[i] = e});
        shared96.fill(0);
        r.fill(0);
    }
    async encrypt(pubBase64:string,data:Uint8Array,zipFist:boolean = true){
        if (zipFist) {
            let zipdata = await this.zlib.gzip(data)
            return this._encrypt(pubBase64,zipdata,true)

        }else{
            return this._encrypt(pubBase64,data,false)
        }
        
    }

    private async _encrypt(pubBase64:string,data:Uint8Array,isZipData:boolean = true){
        let pubKey = base64js.toByteArray(pubBase64);
        if (pubKey.length != 32) {
            throw "pubkey length error"
        }
        let a = await this.genRandomKeyBuffer(32);
        let kp = X25519.generateKeyPair(a);
        let dh = X25519.sharedKey(kp.private,pubKey);

        let hash2 = new Uint8Array(64);
        this.hashDH(dh,pubKey,kp.public,hash2)
        kp.private.fill(0)

        
        // b2b.update('')
        let key = hash2.subarray(0,32)
        let iv = await crypto.getRandomValues(new Uint8Array(16))
        let enc = await this.aesEncrypt(key,iv,data)
        var tmpPub = kp.public
        let b2b = blake2b.blake2bInit(32,hash2.subarray(32,64)) as Blake2b
        blake2b.blake2bUpdate(b2b,iv)
        blake2b.blake2bUpdate(b2b,tmpPub)
        blake2b.blake2bUpdate(b2b,enc);
        let mac = blake2b.blake2bFinal(b2b)

        let result = new Uint8Array(8 + mac.length + iv.length + tmpPub.length + enc.length )
        result[0]= isZipData ? 4 : 5;
        result[1]= 0
        result[2]= 16;
        result[3]= 0;
        result[4]= 32;
        result[5]= 0;
        result[6]= 32;
        result[7]= 0;


        let start = 8;
        result.set(iv,start)
        start += iv.length;
        result.set(mac,start)
        start += mac.length
        result.set(tmpPub,start)
        start += tmpPub.length
        result.set(enc,start)

        return result
    }

    async aesDecrypt(key:Uint8Array,iv:Uint8Array,data:Uint8Array):Promise<Uint8Array>{
        let p = {
            name:'AES-CBC',
            iv:iv,
        }
        let keyObj = await subtle.importKey('raw',key,'AES-CBC',false,['decrypt']);

        return  new Uint8Array(await subtle.decrypt(p,keyObj,data));
    }
    async aesEncrypt(key:Uint8Array,iv:Uint8Array,data:Uint8Array):Promise<Uint8Array>{
        let p = {
            name:'AES-CBC',
            iv:iv,
            length:256
        } as AesKeyAlgorithm
        let keyObj = await subtle.importKey('raw',key,p,false,['encrypt']);
        return new  Uint8Array(await subtle.encrypt(p,keyObj,data));
    }
}

export async function initEC(){
    // await init();
    return new EC()
}
exports.initEC = initEC