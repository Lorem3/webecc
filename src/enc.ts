
var subtle = crypto.subtle

class GZipEnc {
    async gzip(inputarr: Uint8Array): Promise<Uint8Array> {
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
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value !== undefined) chunks.push(value);
        }
        let len = chunks.reduce((s, t) => s + t.length, 0);
        var gzip = new Uint8Array(len);
        var idx = 0;
        chunks.forEach(bytes => {
            bytes.forEach((v) => {
                gzip[idx++] = v;
            });
        });
        return gzip;
    }
}

class Enc {
    private zlib: GZipEnc;

    constructor() {
        this.zlib = new GZipEnc();
    }

    private async sha512(data: Uint8Array): Promise<Uint8Array> {
        const hash = await subtle.digest('SHA-512', data);
        return new Uint8Array(hash);
    }

    private async hmacSha512(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
        const keyObj = await subtle.importKey(
            'raw', key, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
        );
        const sig = await subtle.sign('HMAC', keyObj, data);
        return new Uint8Array(sig).subarray(0, 32);
    }

    private async aesEncrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
        const p = { name: 'AES-CBC', iv: iv, length: 256 } as AesKeyAlgorithm;
        const keyObj = await subtle.importKey('raw', key, p, false, ['encrypt']);
        return new Uint8Array(await subtle.encrypt(p, keyObj, data));
    }

    private async hashDH(dh: Uint8Array, pub1: Uint8Array, pub2: Uint8Array): Promise<Uint8Array> {
        let shared96 = new Uint8Array(96);
        dh.forEach((e, i) => {
            shared96[i] = e;
        });

        let flag = 0;
        for (let i = 31; i >= 0; --i) {
            if (pub1[i] < pub2[i]) {
                flag = -1;
                break;
            } else if (pub1[i] > pub2[i]) {
                flag = 1;
                break;
            }
        }

        if (flag == -1) {
            pub1.forEach((e, i) => { shared96[i + 32] = e; });
            pub2.forEach((e, i) => { shared96[i + 64] = e; });
        } else {
            pub2.forEach((e, i) => { shared96[i + 32] = e; });
            pub1.forEach((e, i) => { shared96[i + 64] = e; });
        }

        const r = await this.sha512(shared96);
        shared96.fill(0);
        return r;
    }

    async encrypt(pubKey: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
        try {
            if (pubKey.length !== 32) {
                throw "public key length must be 32";
            }

            // 1. Import recipient's public key
            console.log('Enc: 1. Importing public key...');
            const recipientPubKey = await subtle.importKey(
                'raw', pubKey, { name: 'X25519' }, true, []
            );
            console.log('Enc: 1. OK');

            // 2. Generate ephemeral X25519 key pair
            console.log('Enc: 2. Generating ephemeral key pair...');
            const ephemeralKeyPair = await subtle.generateKey(
                { name: 'X25519' },
                true,
                ['deriveBits', 'deriveKey']
            ) as CryptoKeyPair;
            console.log('Enc: 2. OK');

            // 3. Export ephemeral public key
            console.log('Enc: 3. Exporting ephemeral public key...');
            const ephemeralPubJwk = await subtle.exportKey('jwk', ephemeralKeyPair.publicKey);
            const ephemeralPubBytes = new Uint8Array(
                atob(ephemeralPubJwk.x!.replace(/-/g, '+').replace(/_/g, '/'))
                    .split('')
                    .map(c => c.charCodeAt(0))
            );
            console.log('Enc: 3. OK, length:', ephemeralPubBytes.length);

            // 4. Compute shared secret using ECDH
            // 注意：这里使用 { name: 'X25519' } 而不是 { name: 'ECDH' }
            console.log('Enc: 4. Computing shared secret with deriveBits...');
            console.log('Enc: 4. recipientPubKey algorithm:', recipientPubKey.algorithm);
            console.log('Enc: 4. ephemeralKeyPair.privateKey algorithm:', ephemeralKeyPair.privateKey.algorithm);
            const sharedBits = await subtle.deriveBits(
                { name: 'X25519', public: recipientPubKey },
                ephemeralKeyPair.privateKey,
                256
            );
            const sharedSecret = new Uint8Array(sharedBits);
            console.log('Enc: 4. OK, length:', sharedSecret.length);

            // 5. Derive encryption key
            console.log('Enc: 5. Deriving encryption key...');
            const hash64 = await this.hashDH(sharedSecret, pubKey, ephemeralPubBytes);
            const encKey = hash64.subarray(0, 32);
            const macKey = hash64.subarray(32, 64);
            console.log('Enc: 5. OK');

            // 6. Compress data
            console.log('Enc: 6. Compressing data...');
            const compressed = await this.zlib.gzip(msg);
            console.log('Enc: 6. OK, length:', compressed.length);

            // 7. Generate random IV
            console.log('Enc: 7. Generating IV...');
            const iv = crypto.getRandomValues(new Uint8Array(16));
            console.log('Enc: 7. OK');

            // 8. Encrypt with AES-CBC
            console.log('Enc: 8. Encrypting with AES...');
            const enc = await this.aesEncrypt(encKey, iv, compressed);
            console.log('Enc: 8. OK, length:', enc.length);

            // 9. Compute MAC
            console.log('Enc: 9. Computing MAC...');
            const macData = new Uint8Array(iv.length + ephemeralPubBytes.length + enc.length);
            macData.set(iv, 0);
            macData.set(ephemeralPubBytes, iv.length);
            macData.set(enc, iv.length + ephemeralPubBytes.length);
            const mac = await this.hmacSha512(macKey, macData);
            console.log('Enc: 9. OK');

            // 10. Build result
            console.log('Enc: 10. Building result...');
            const result = new Uint8Array(8 + iv.length + mac.length + ephemeralPubBytes.length + enc.length);
            result[0] = 0x0D;
            result[1] = 0;
            result[2] = 16;
            result[3] = 0;
            result[4] = 32;
            result[5] = 0;
            result[6] = 32;
            result[7] = 0;

            let start = 8;
            result.set(iv, start);
            start += iv.length;
            result.set(mac, start);
            start += mac.length;
            result.set(ephemeralPubBytes, start);
            start += ephemeralPubBytes.length;
            result.set(enc, start);

            console.log('Enc: 10. OK, total length:', result.length);
            return result;
        } catch (e) {
            console.error('Enc encrypt error:', e);
            throw e;
        }
    }
}

export async function initEnc() {
    return new Enc();
}
exports.initEnc = initEnc;
