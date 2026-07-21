// X25519 implementation using Web Crypto API
// Replaces static/curve25519.js, provides the same global X25519 object

const X25519 = (function () {
    const subtle = crypto.subtle;

    function b64ToBytes(b64: string): Uint8Array {
        const s = b64.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(s);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    /** Wrap a raw 32-byte X25519 private key in PKCS#8 DER for Web Crypto importKey */
    function pkcs8Wrap(privKey: Uint8Array): ArrayBuffer {
        if (privKey.length !== 32) throw "x25519 private key must be 32 bytes";
        const pkcs8 = new Uint8Array(48);
        pkcs8[0] = 0x30; pkcs8[1] = 0x2e;               // SEQUENCE (46 bytes)
        pkcs8[2] = 0x02; pkcs8[3] = 0x01; pkcs8[4] = 0x00; // INTEGER 0 (version)
        pkcs8[5] = 0x30; pkcs8[6] = 0x05;               // SEQUENCE (5 bytes) AlgorithmIdentifier
        pkcs8[7] = 0x06; pkcs8[8] = 0x03;               // OID (3 bytes)
        pkcs8[9] = 0x2b; pkcs8[10] = 0x65; pkcs8[11] = 0x6e; // 1.3.101.110 (X25519)
        pkcs8[12] = 0x04; pkcs8[13] = 0x22;             // OCTET STRING (34 bytes)
        pkcs8[14] = 0x04; pkcs8[15] = 0x20;             // OCTET STRING (32 bytes)
        pkcs8.set(privKey, 16);
        return pkcs8.buffer;
    }

    /** Curve25519 clamping (D.J. Bernstein): match legacy curve25519.js private-key output */
    function clamp(seed: Uint8Array): Uint8Array {
        const priv = new Uint8Array(seed);
        priv[0] &= 248;
        priv[31] &= 127;
        priv[31] |= 64;
        return priv;
    }

    async function generateKeyPair(seed: Uint8Array): Promise<{ public: Uint8Array; private: Uint8Array }> {
        const priv = clamp(seed);
        const privKey = await subtle.importKey(
            'pkcs8', pkcs8Wrap(priv), { name: 'X25519' }, true, ['deriveBits']
        );
        const jwk = await subtle.exportKey('jwk', privKey);
        const pubBytes = b64ToBytes(jwk.x!);
        return { public: pubBytes, private: priv };
    }

    async function sharedKey(privateKey: Uint8Array, publicKey: Uint8Array): Promise<Uint8Array> {
        const privKey = await subtle.importKey(
            'pkcs8', pkcs8Wrap(clamp(privateKey)), { name: 'X25519' }, false, ['deriveBits']
        );
        const pubKey = await subtle.importKey(
            'raw', publicKey, { name: 'X25519' }, true, []
        );
        const bits = await subtle.deriveBits(
            { name: 'X25519', public: pubKey }, privKey, 256
        );
        return new Uint8Array(bits);
    }

    return { generateKeyPair, sharedKey };
})();
