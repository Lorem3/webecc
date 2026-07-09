
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
            const recipientPubKey = await subtle.importKey(
                'raw', pubKey, { name: 'X25519' }, true, []
            );

            // 2. Generate ephemeral X25519 key pair
            const ephemeralKeyPair = await subtle.generateKey(
                { name: 'X25519' },
                true,
                ['deriveBits', 'deriveKey']
            ) as CryptoKeyPair;

            // 3. Export ephemeral public key
            const ephemeralPubJwk = await subtle.exportKey('jwk', ephemeralKeyPair.publicKey);
            const ephemeralPubBytes = new Uint8Array(
                atob(ephemeralPubJwk.x!.replace(/-/g, '+').replace(/_/g, '/'))
                    .split('')
                    .map(c => c.charCodeAt(0))
            );

            // 4. Compute shared secret using ECDH
            const sharedBits = await subtle.deriveBits(
                { name: 'X25519', public: recipientPubKey },
                ephemeralKeyPair.privateKey,
                256
            );
            const sharedSecret = new Uint8Array(sharedBits);

            // 5. Derive encryption key
            const hash64 = await this.hashDH(sharedSecret, pubKey, ephemeralPubBytes);
            const encKey = hash64.subarray(0, 32);
            const macKey = hash64.subarray(32, 64);

            // 6. Compress data
            const compressed = await this.zlib.gzip(msg);

            // 7. Generate random IV
            const iv = crypto.getRandomValues(new Uint8Array(16));

            // 8. Encrypt with AES-CBC
            const enc = await this.aesEncrypt(encKey, iv, compressed);

            // 9. Compute MAC
            const macData = new Uint8Array(iv.length + ephemeralPubBytes.length + enc.length);
            macData.set(iv, 0);
            macData.set(ephemeralPubBytes, iv.length);
            macData.set(enc, iv.length + ephemeralPubBytes.length);
            const mac = await this.hmacSha512(macKey, macData);

            // 10. Build result
            const result = new Uint8Array(8 + iv.length + mac.length + ephemeralPubBytes.length + enc.length);
            result[0] = 0x0C;
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

            return result;
        } catch (e) {
            throw e;
        }
    }
}

export async function initEnc() {
    return new Enc();
}
exports.initEnc = initEnc;
