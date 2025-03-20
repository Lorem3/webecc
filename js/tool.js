"use strict";

Object.defineProperty(exports, "__esModule", {
    value: !0
});

var Base64 = function() {
    function e() {}
    return e.prototype.byte2Char = function(e) {
        return (e &= 63) < 26 ? String.fromCharCode(e + 65) : e < 52 ? String.fromCharCode(e - 26 + 97) : e < 62 ? String.fromCharCode(e - 52 + 48) : 62 == e ? "+" : "/";
    }, e.prototype.char2byte = function(e) {
        return e >= 65 && e <= 90 ? e - 65 : e >= 97 && e <= 122 ? e - 97 + 26 : e >= 48 && e <= 57 ? e - 48 + 52 : 43 == e ? 62 : 47 == e ? 63 : 64;
    }, e.prototype.encode = function(e, r) {
        void 0 === r && (r = 0);
        for (var t = "", o = 0, n = e.length, a = 0, s = 0; s < n; s++) {
            var i = e[s];
            switch (s % 3) {
              case 0:
                t += this.byte2Char(i >> 2), o = i << 4 & 63, ++a && r && a % r == 0 && (t += "\r\n");
                break;

              case 1:
                t += this.byte2Char(i >> 4 | o), o = i << 2 & 63, ++a && r && a % r == 0 && (t += "\r\n");
                break;

              case 2:
                t += this.byte2Char(i >> 6 | o), ++a && r && a % r == 0 && (t += "\r\n"), t += this.byte2Char(i), 
                ++a && r && a % r == 0 && (t += "\r\n");
            }
        }
        var c = n % 3;
        return 0 != c && (t += this.byte2Char(o), t += 1 == c ? "==" : "="), t;
    }, e.prototype.decode = function(e) {
        for (var r = (new TextEncoder).encode(e), t = new Uint8Array(r.length), o = r.length, n = 0, a = 0, s = 0, i = 0, c = 64; n < o; ) {
            c = 64;
            do {
                c = this.char2byte(r[n]), n++;
            } while (64 == c && n < o);
            if (!(c < 64)) break;
            switch (3 & i) {
              case 0:
                s = c << 2;
                break;

              case 1:
                var h = s | c >> 4;
                s = c << 4, t[a++] = h;
                break;

              case 2:
                var y = s | c >> 2;
                s = c << 6, t[a++] = y;
                break;

              case 3:
                t[a++] = s | c;
            }
            i++;
        }
        return t.slice(0, a);
    }, e.prototype.toByteArray = function(e) {
        return this.decode(e);
    }, e.prototype.fromByteArray = function(e, r) {
        return void 0 === r && (r = 0), this.encode(e, r);
    }, e;
}(), base64js = new Base64;

exports.base64js = base64js;

const util = function() {
    function uint32ToHex(val) {
        return (4294967296 + val).toString(16).substring(1);
    }
    return {
        normalizeInput: function(input) {
            let ret;
            if (input instanceof Uint8Array) ret = input; else {
                if ("string" != typeof input) throw new Error("Input must be an string, Buffer or Uint8Array");
                ret = (new TextEncoder).encode(input);
            }
            return ret;
        },
        toHex: function(bytes) {
            return Array.prototype.map.call(bytes, (function(n) {
                return (n < 16 ? "0" : "") + n.toString(16);
            })).join("");
        },
        debugPrint: function(label, arr, size) {
            let msg = "\n" + label + " = ";
            for (let i = 0; i < arr.length; i += 2) {
                if (32 === size) msg += uint32ToHex(arr[i]).toUpperCase(), msg += " ", msg += uint32ToHex(arr[i + 1]).toUpperCase(); else {
                    if (64 !== size) throw new Error("Invalid size " + size);
                    msg += uint32ToHex(arr[i + 1]).toUpperCase(), msg += uint32ToHex(arr[i]).toUpperCase();
                }
                i % 6 == 4 ? msg += "\n" + new Array(label.length + 4).join(" ") : i < arr.length - 2 && (msg += " ");
            }
        },
        testSpeed: function(hashFn, N, M) {
            let startMs = (new Date).getTime();
            const input = new Uint8Array(N);
            for (let i = 0; i < N; i++) input[i] = i % 256;
            const genMs = (new Date).getTime();
            startMs = genMs;
            for (let i = 0; i < M; i++) {
                const hashHex = hashFn(input), hashMs = (new Date).getTime(), ms = hashMs - startMs;
                startMs = hashMs, hashHex.substring(0, 20), Math.round(N / (1 << 20) / (ms / 1e3) * 100);
            }
        }
    };
}(), blake2b = function() {
    function ADD64AA(v, a, b) {
        const o0 = v[a] + v[b];
        let o1 = v[a + 1] + v[b + 1];
        o0 >= 4294967296 && o1++, v[a] = o0, v[a + 1] = o1;
    }
    function ADD64AC(v, a, b0, b1) {
        let o0 = v[a] + b0;
        b0 < 0 && (o0 += 4294967296);
        let o1 = v[a + 1] + b1;
        o0 >= 4294967296 && o1++, v[a] = o0, v[a + 1] = o1;
    }
    function B2B_GET32(arr, i) {
        return arr[i] ^ arr[i + 1] << 8 ^ arr[i + 2] << 16 ^ arr[i + 3] << 24;
    }
    function B2B_G(a, b, c, d, ix, iy) {
        const x0 = m[ix], x1 = m[ix + 1], y0 = m[iy], y1 = m[iy + 1];
        ADD64AA(v, a, b), ADD64AC(v, a, x0, x1);
        let xor0 = v[d] ^ v[a], xor1 = v[d + 1] ^ v[a + 1];
        v[d] = xor1, v[d + 1] = xor0, ADD64AA(v, c, d), xor0 = v[b] ^ v[c], xor1 = v[b + 1] ^ v[c + 1], 
        v[b] = xor0 >>> 24 ^ xor1 << 8, v[b + 1] = xor1 >>> 24 ^ xor0 << 8, ADD64AA(v, a, b), 
        ADD64AC(v, a, y0, y1), xor0 = v[d] ^ v[a], xor1 = v[d + 1] ^ v[a + 1], v[d] = xor0 >>> 16 ^ xor1 << 16, 
        v[d + 1] = xor1 >>> 16 ^ xor0 << 16, ADD64AA(v, c, d), xor0 = v[b] ^ v[c], xor1 = v[b + 1] ^ v[c + 1], 
        v[b] = xor1 >>> 31 ^ xor0 << 1, v[b + 1] = xor0 >>> 31 ^ xor1 << 1;
    }
    const BLAKE2B_IV32 = new Uint32Array([ 4089235720, 1779033703, 2227873595, 3144134277, 4271175723, 1013904242, 1595750129, 2773480762, 2917565137, 1359893119, 725511199, 2600822924, 4215389547, 528734635, 327033209, 1541459225 ]), SIGMA82 = new Uint8Array([ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3, 11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4, 7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8, 9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13, 2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9, 12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11, 13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10, 6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5, 10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3 ].map((function(x) {
        return 2 * x;
    }))), v = new Uint32Array(32), m = new Uint32Array(32);
    function blake2bCompress(ctx, last) {
        let i = 0;
        for (i = 0; i < 16; i++) v[i] = ctx.h[i], v[i + 16] = BLAKE2B_IV32[i];
        for (v[24] = v[24] ^ ctx.t, v[25] = v[25] ^ ctx.t / 4294967296, last && (v[28] = ~v[28], 
        v[29] = ~v[29]), i = 0; i < 32; i++) m[i] = B2B_GET32(ctx.b, 4 * i);
        for (i = 0; i < 12; i++) B2B_G(0, 8, 16, 24, SIGMA82[16 * i + 0], SIGMA82[16 * i + 1]), 
        B2B_G(2, 10, 18, 26, SIGMA82[16 * i + 2], SIGMA82[16 * i + 3]), B2B_G(4, 12, 20, 28, SIGMA82[16 * i + 4], SIGMA82[16 * i + 5]), 
        B2B_G(6, 14, 22, 30, SIGMA82[16 * i + 6], SIGMA82[16 * i + 7]), B2B_G(0, 10, 20, 30, SIGMA82[16 * i + 8], SIGMA82[16 * i + 9]), 
        B2B_G(2, 12, 22, 24, SIGMA82[16 * i + 10], SIGMA82[16 * i + 11]), B2B_G(4, 14, 16, 26, SIGMA82[16 * i + 12], SIGMA82[16 * i + 13]), 
        B2B_G(6, 8, 18, 28, SIGMA82[16 * i + 14], SIGMA82[16 * i + 15]);
        for (i = 0; i < 16; i++) ctx.h[i] = ctx.h[i] ^ v[i] ^ v[i + 16];
    }
    const parameterBlock = new Uint8Array([ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ]);
    function blake2bInit(outlen, key, salt, personal) {
        if (0 === outlen || outlen > 64) throw new Error("Illegal output length, expected 0 < length <= 64");
        if (key && key.length > 64) throw new Error("Illegal key, expected Uint8Array with 0 < length <= 64");
        if (salt && 16 !== salt.length) throw new Error("Illegal salt, expected Uint8Array with length is 16");
        if (personal && 16 !== personal.length) throw new Error("Illegal personal, expected Uint8Array with length is 16");
        const ctx = {
            b: new Uint8Array(128),
            h: new Uint32Array(16),
            t: 0,
            c: 0,
            outlen: outlen
        };
        parameterBlock.fill(0), parameterBlock[0] = outlen, key && (parameterBlock[1] = key.length), 
        parameterBlock[2] = 1, parameterBlock[3] = 1, salt && parameterBlock.set(salt, 32), 
        personal && parameterBlock.set(personal, 48);
        for (let i = 0; i < 16; i++) ctx.h[i] = BLAKE2B_IV32[i] ^ B2B_GET32(parameterBlock, 4 * i);
        return key && (blake2bUpdate(ctx, key), ctx.c = 128), ctx;
    }
    function blake2bUpdate(ctx, input) {
        for (let i = 0; i < input.length; i++) 128 === ctx.c && (ctx.t += ctx.c, blake2bCompress(ctx, !1), 
        ctx.c = 0), ctx.b[ctx.c++] = input[i];
    }
    function blake2bFinal(ctx) {
        for (ctx.t += ctx.c; ctx.c < 128; ) ctx.b[ctx.c++] = 0;
        blake2bCompress(ctx, !0);
        const out = new Uint8Array(ctx.outlen);
        for (let i = 0; i < ctx.outlen; i++) out[i] = ctx.h[i >> 2] >> 8 * (3 & i);
        return out;
    }
    function blake2b(input, key, outlen, salt, personal) {
        outlen = outlen || 64, input = util.normalizeInput(input), salt && (salt = util.normalizeInput(salt)), 
        personal && (personal = util.normalizeInput(personal));
        const ctx = blake2bInit(outlen, key, salt, personal);
        return blake2bUpdate(ctx, input), blake2bFinal(ctx);
    }
    return {
        blake2b: blake2b,
        blake2bHex: function(input, key, outlen, salt, personal) {
            const output = blake2b(input, key, outlen, salt, personal);
            return util.toHex(output);
        },
        blake2bInit: blake2bInit,
        blake2bUpdate: blake2bUpdate,
        blake2bFinal: blake2bFinal
    };
}();

function X25519F() {
    new Uint8Array(16);
    let _9 = new Uint8Array(32);
    function gf(init) {
        var i, r = new Float64Array(16);
        if (init) for (i = 0; i < init.length; i++) r[i] = init[i];
        return r;
    }
    _9[0] = 9;
    gf(), gf([ 1 ]);
    const _121665 = gf([ 56129, 1 ]);
    gf([ 30883, 4953, 19914, 30187, 55467, 16705, 2637, 112, 59544, 30585, 16505, 36039, 65139, 11119, 27886, 20995 ]), 
    gf([ 61785, 9906, 39828, 60374, 45398, 33411, 5274, 224, 53552, 61171, 33010, 6542, 64743, 22239, 55772, 9222 ]), 
    gf([ 54554, 36645, 11616, 51542, 42930, 38181, 51040, 26924, 56412, 64982, 57905, 49316, 21502, 52590, 14035, 8553 ]), 
    gf([ 26200, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214 ]), 
    gf([ 41136, 18958, 6951, 50414, 58488, 44335, 6150, 12099, 55207, 15867, 153, 11085, 57099, 20417, 9344, 11139 ]);
    function car25519(o) {
        var i, v, c = 1;
        for (i = 0; i < 16; i++) v = o[i] + c + 65535, c = Math.floor(v / 65536), o[i] = v - 65536 * c;
        o[0] += c - 1 + 37 * (c - 1);
    }
    function sel25519(p, q, b) {
        for (var t, c = ~(b - 1), i = 0; i < 16; i++) t = c & (p[i] ^ q[i]), p[i] ^= t, 
        q[i] ^= t;
    }
    function pack25519(o, n) {
        var i, j, b, m = gf(), t = gf();
        for (i = 0; i < 16; i++) t[i] = n[i];
        for (car25519(t), car25519(t), car25519(t), j = 0; j < 2; j++) {
            for (m[0] = t[0] - 65517, i = 1; i < 15; i++) m[i] = t[i] - 65535 - (m[i - 1] >> 16 & 1), 
            m[i - 1] &= 65535;
            m[15] = t[15] - 32767 - (m[14] >> 16 & 1), b = m[15] >> 16 & 1, m[14] &= 65535, 
            sel25519(t, m, 1 - b);
        }
        for (i = 0; i < 16; i++) o[2 * i] = 255 & t[i], o[2 * i + 1] = t[i] >> 8;
    }
    function unpack25519(o, n) {
        var i;
        for (i = 0; i < 16; i++) o[i] = n[2 * i] + (n[2 * i + 1] << 8);
        o[15] &= 32767;
    }
    function A(o, a, b) {
        for (var i = 0; i < 16; i++) o[i] = a[i] + b[i];
    }
    function Z(o, a, b) {
        for (var i = 0; i < 16; i++) o[i] = a[i] - b[i];
    }
    function M(o, a, b) {
        var v, c, t0 = 0, t1 = 0, t2 = 0, t3 = 0, t4 = 0, t5 = 0, t6 = 0, t7 = 0, t8 = 0, t9 = 0, t10 = 0, t11 = 0, t12 = 0, t13 = 0, t14 = 0, t15 = 0, t16 = 0, t17 = 0, t18 = 0, t19 = 0, t20 = 0, t21 = 0, t22 = 0, t23 = 0, t24 = 0, t25 = 0, t26 = 0, t27 = 0, t28 = 0, t29 = 0, t30 = 0, b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7], b8 = b[8], b9 = b[9], b10 = b[10], b11 = b[11], b12 = b[12], b13 = b[13], b14 = b[14], b15 = b[15];
        t0 += (v = a[0]) * b0, t1 += v * b1, t2 += v * b2, t3 += v * b3, t4 += v * b4, t5 += v * b5, 
        t6 += v * b6, t7 += v * b7, t8 += v * b8, t9 += v * b9, t10 += v * b10, t11 += v * b11, 
        t12 += v * b12, t13 += v * b13, t14 += v * b14, t15 += v * b15, t1 += (v = a[1]) * b0, 
        t2 += v * b1, t3 += v * b2, t4 += v * b3, t5 += v * b4, t6 += v * b5, t7 += v * b6, 
        t8 += v * b7, t9 += v * b8, t10 += v * b9, t11 += v * b10, t12 += v * b11, t13 += v * b12, 
        t14 += v * b13, t15 += v * b14, t16 += v * b15, t2 += (v = a[2]) * b0, t3 += v * b1, 
        t4 += v * b2, t5 += v * b3, t6 += v * b4, t7 += v * b5, t8 += v * b6, t9 += v * b7, 
        t10 += v * b8, t11 += v * b9, t12 += v * b10, t13 += v * b11, t14 += v * b12, t15 += v * b13, 
        t16 += v * b14, t17 += v * b15, t3 += (v = a[3]) * b0, t4 += v * b1, t5 += v * b2, 
        t6 += v * b3, t7 += v * b4, t8 += v * b5, t9 += v * b6, t10 += v * b7, t11 += v * b8, 
        t12 += v * b9, t13 += v * b10, t14 += v * b11, t15 += v * b12, t16 += v * b13, t17 += v * b14, 
        t18 += v * b15, t4 += (v = a[4]) * b0, t5 += v * b1, t6 += v * b2, t7 += v * b3, 
        t8 += v * b4, t9 += v * b5, t10 += v * b6, t11 += v * b7, t12 += v * b8, t13 += v * b9, 
        t14 += v * b10, t15 += v * b11, t16 += v * b12, t17 += v * b13, t18 += v * b14, 
        t19 += v * b15, t5 += (v = a[5]) * b0, t6 += v * b1, t7 += v * b2, t8 += v * b3, 
        t9 += v * b4, t10 += v * b5, t11 += v * b6, t12 += v * b7, t13 += v * b8, t14 += v * b9, 
        t15 += v * b10, t16 += v * b11, t17 += v * b12, t18 += v * b13, t19 += v * b14, 
        t20 += v * b15, t6 += (v = a[6]) * b0, t7 += v * b1, t8 += v * b2, t9 += v * b3, 
        t10 += v * b4, t11 += v * b5, t12 += v * b6, t13 += v * b7, t14 += v * b8, t15 += v * b9, 
        t16 += v * b10, t17 += v * b11, t18 += v * b12, t19 += v * b13, t20 += v * b14, 
        t21 += v * b15, t7 += (v = a[7]) * b0, t8 += v * b1, t9 += v * b2, t10 += v * b3, 
        t11 += v * b4, t12 += v * b5, t13 += v * b6, t14 += v * b7, t15 += v * b8, t16 += v * b9, 
        t17 += v * b10, t18 += v * b11, t19 += v * b12, t20 += v * b13, t21 += v * b14, 
        t22 += v * b15, t8 += (v = a[8]) * b0, t9 += v * b1, t10 += v * b2, t11 += v * b3, 
        t12 += v * b4, t13 += v * b5, t14 += v * b6, t15 += v * b7, t16 += v * b8, t17 += v * b9, 
        t18 += v * b10, t19 += v * b11, t20 += v * b12, t21 += v * b13, t22 += v * b14, 
        t23 += v * b15, t9 += (v = a[9]) * b0, t10 += v * b1, t11 += v * b2, t12 += v * b3, 
        t13 += v * b4, t14 += v * b5, t15 += v * b6, t16 += v * b7, t17 += v * b8, t18 += v * b9, 
        t19 += v * b10, t20 += v * b11, t21 += v * b12, t22 += v * b13, t23 += v * b14, 
        t24 += v * b15, t10 += (v = a[10]) * b0, t11 += v * b1, t12 += v * b2, t13 += v * b3, 
        t14 += v * b4, t15 += v * b5, t16 += v * b6, t17 += v * b7, t18 += v * b8, t19 += v * b9, 
        t20 += v * b10, t21 += v * b11, t22 += v * b12, t23 += v * b13, t24 += v * b14, 
        t25 += v * b15, t11 += (v = a[11]) * b0, t12 += v * b1, t13 += v * b2, t14 += v * b3, 
        t15 += v * b4, t16 += v * b5, t17 += v * b6, t18 += v * b7, t19 += v * b8, t20 += v * b9, 
        t21 += v * b10, t22 += v * b11, t23 += v * b12, t24 += v * b13, t25 += v * b14, 
        t26 += v * b15, t12 += (v = a[12]) * b0, t13 += v * b1, t14 += v * b2, t15 += v * b3, 
        t16 += v * b4, t17 += v * b5, t18 += v * b6, t19 += v * b7, t20 += v * b8, t21 += v * b9, 
        t22 += v * b10, t23 += v * b11, t24 += v * b12, t25 += v * b13, t26 += v * b14, 
        t27 += v * b15, t13 += (v = a[13]) * b0, t14 += v * b1, t15 += v * b2, t16 += v * b3, 
        t17 += v * b4, t18 += v * b5, t19 += v * b6, t20 += v * b7, t21 += v * b8, t22 += v * b9, 
        t23 += v * b10, t24 += v * b11, t25 += v * b12, t26 += v * b13, t27 += v * b14, 
        t28 += v * b15, t14 += (v = a[14]) * b0, t15 += v * b1, t16 += v * b2, t17 += v * b3, 
        t18 += v * b4, t19 += v * b5, t20 += v * b6, t21 += v * b7, t22 += v * b8, t23 += v * b9, 
        t24 += v * b10, t25 += v * b11, t26 += v * b12, t27 += v * b13, t28 += v * b14, 
        t29 += v * b15, t15 += (v = a[15]) * b0, t1 += 38 * (t17 += v * b2), t2 += 38 * (t18 += v * b3), 
        t3 += 38 * (t19 += v * b4), t4 += 38 * (t20 += v * b5), t5 += 38 * (t21 += v * b6), 
        t6 += 38 * (t22 += v * b7), t7 += 38 * (t23 += v * b8), t8 += 38 * (t24 += v * b9), 
        t9 += 38 * (t25 += v * b10), t10 += 38 * (t26 += v * b11), t11 += 38 * (t27 += v * b12), 
        t12 += 38 * (t28 += v * b13), t13 += 38 * (t29 += v * b14), t14 += 38 * (t30 += v * b15), 
        t0 = (v = (t0 += 38 * (t16 += v * b1)) + (c = 1) + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t1 = (v = t1 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t2 = (v = t2 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t3 = (v = t3 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t4 = (v = t4 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t5 = (v = t5 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t6 = (v = t6 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t7 = (v = t7 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t8 = (v = t8 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t9 = (v = t9 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t10 = (v = t10 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t11 = (v = t11 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t12 = (v = t12 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t13 = (v = t13 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t14 = (v = t14 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t15 = (v = t15 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t0 = (v = (t0 += c - 1 + 37 * (c - 1)) + (c = 1) + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t1 = (v = t1 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t2 = (v = t2 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t3 = (v = t3 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t4 = (v = t4 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t5 = (v = t5 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t6 = (v = t6 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t7 = (v = t7 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t8 = (v = t8 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t9 = (v = t9 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t10 = (v = t10 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t11 = (v = t11 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t12 = (v = t12 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t13 = (v = t13 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t14 = (v = t14 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), 
        t15 = (v = t15 + c + 65535) - 65536 * (c = Math.floor(v / 65536)), t0 += c - 1 + 37 * (c - 1), 
        o[0] = t0, o[1] = t1, o[2] = t2, o[3] = t3, o[4] = t4, o[5] = t5, o[6] = t6, o[7] = t7, 
        o[8] = t8, o[9] = t9, o[10] = t10, o[11] = t11, o[12] = t12, o[13] = t13, o[14] = t14, 
        o[15] = t15;
    }
    function S(o, a) {
        M(o, a, a);
    }
    function inv25519(o, i) {
        var a, c = gf();
        for (a = 0; a < 16; a++) c[a] = i[a];
        for (a = 253; a >= 0; a--) S(c, c), 2 !== a && 4 !== a && M(c, c, i);
        for (a = 0; a < 16; a++) o[a] = c[a];
    }
    function crypto_scalarmult(q, n, p) {
        var r, i, z = new Uint8Array(32), x = new Float64Array(80), a = gf(), b = gf(), c = gf(), d = gf(), e = gf(), f = gf();
        for (i = 0; i < 31; i++) z[i] = n[i];
        for (z[31] = 127 & n[31] | 64, z[0] &= 248, unpack25519(x, p), i = 0; i < 16; i++) b[i] = x[i], 
        d[i] = a[i] = c[i] = 0;
        for (a[0] = d[0] = 1, i = 254; i >= 0; --i) sel25519(a, b, r = z[i >>> 3] >>> (7 & i) & 1), 
        sel25519(c, d, r), A(e, a, c), Z(a, a, c), A(c, b, d), Z(b, b, d), S(d, e), S(f, a), 
        M(a, c, a), M(c, b, e), A(e, a, c), Z(a, a, c), S(b, a), Z(c, d, f), M(a, c, _121665), 
        A(a, a, d), M(c, c, a), M(a, d, f), M(d, b, x), S(b, e), sel25519(a, b, r), sel25519(c, d, r);
        for (i = 0; i < 16; i++) x[i + 16] = a[i], x[i + 32] = c[i], x[i + 48] = b[i], x[i + 64] = d[i];
        var x32 = x.subarray(32), x16 = x.subarray(16);
        return inv25519(x32, x32), M(x16, x16, x32), pack25519(q, x16), 0;
    }
    new Float64Array([ 237, 211, 245, 92, 26, 99, 18, 88, 214, 156, 247, 162, 222, 249, 222, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 16 ]);
    function checkArrayTypes(...args) {
        var t, i;
        for (i = 0; i < arguments.length; i++) if ("[object Uint8Array]" !== (t = Object.prototype.toString.call(arguments[i]))) throw new TypeError("unexpected type " + t + ", use Uint8Array");
    }
    return {
        generateKeyPair: function(seed) {
            if (checkArrayTypes(seed), 32 !== seed.length) throw new Error("wrong seed length");
            for (var sk = new Uint8Array(32), pk = new Uint8Array(32), i = 0; i < 32; i++) sk[i] = seed[i];
            return crypto_scalarmult(pk, sk, _9), sk[0] &= 248, sk[31] &= 127, sk[31] |= 64, 
            pk[31] &= 127, {
                public: pk,
                private: sk
            };
        },
        sharedKey: function(secretKey, publicKey) {
            if (checkArrayTypes(publicKey, secretKey), 32 !== publicKey.length) throw new Error("wrong public key length");
            if (32 !== secretKey.length) throw new Error("wrong secret key length");
            var sharedKey = new Uint8Array(32);
            return crypto_scalarmult(sharedKey, secretKey, publicKey), sharedKey;
        }
    };
}

const X25519 = X25519F();

var subtle = crypto.subtle;

class GZip {
    async gzip(inputarr) {
        const inputStream = new ReadableStream({
            start(controller) {
                controller.enqueue(inputarr), controller.close();
            }
        }), gzs = new CompressionStream("gzip"), reader = inputStream.pipeThrough(gzs).getReader();
        let chunks = [];
        for (inputarr.length; ;) try {
            const {done: done, value: value} = await reader.read();
            if (null == value || value.length, done) break;
            void 0 !== value && chunks.push(value);
        } catch (error) {
            break;
        }
        let len = chunks.reduce(((s, t) => s + t.length), 0);
        var gzip = new Uint8Array(len), idx = 0;
        return chunks.forEach((bytes => {
            bytes.forEach((v => {
                gzip[idx++] = v;
            }));
        })), gzip;
    }
    async ungzip(inputarr) {
        const inputStream = new ReadableStream({
            start(controller) {
                controller.enqueue(inputarr), controller.close();
            }
        }), gzs = new DecompressionStream("gzip"), reader = inputStream.pipeThrough(gzs).getReader();
        let chunks = [];
        for (inputarr.length; ;) try {
            const {done: done, value: value} = await reader.read();
            if (null == value || value.length, done) break;
            void 0 !== value && chunks.push(value);
        } catch (error) {
            break;
        }
        let len = chunks.reduce(((s, t) => s + t.length), 0);
        var plain = new Uint8Array(len), idx = 0;
        return chunks.forEach((bytes => {
            bytes.forEach((v => {
                plain[idx++] = v;
            }));
        })), plain;
    }
}

class EC {
    constructor() {
        this.zlib = new GZip;
    }
    toHex(arr) {
        let strArr = [];
        return arr.forEach((e => {
            let s = e.toString(16);
            strArr.push(1 == s.length ? "0" + s : s);
        })), strArr.join("");
    }
    async genRandomKeyBuffer(length = 32) {
        let keyObj = await subtle.generateKey({
            name: "HMAC",
            hash: "SHA-512",
            length: 256
        }, !0, [ "sign" ]), keyBf = await subtle.exportKey("raw", keyObj);
        keyObj = await subtle.importKey("raw", keyBf, "PBKDF2", !1, [ "deriveKey" ]);
        let pbkdf2 = {
            name: "PBKDF2",
            hash: "SHA-512",
            iterations: 10,
            salt: crypto.getRandomValues(new Uint8Array(64)).buffer
        }, dk = {
            name: "HMAC",
            hash: "SHA-512",
            length: 8 * length
        }, result = await subtle.deriveKey(pbkdf2, keyObj, dk, !0, [ "sign" ]);
        return new Uint8Array(await subtle.exportKey("raw", result));
    }
    base64Encode(arr) {
        return base64js.fromByteArray(arr, 76);
    }
    base64Decode(str) {
        return base64js.toByteArray(str);
    }
    async generateNewKeyPair(seckey) {
        let a = null;
        if (seckey) {
            if (a = this.base64Decode(seckey), 32 != (null == a ? void 0 : a.length)) throw "private key length must be 32";
        } else a = await this.genRandomKeyBuffer();
        let kp = X25519.generateKeyPair(a);
        return {
            public: base64js.fromByteArray(kp.public),
            private: base64js.fromByteArray(kp.private)
        };
    }
    async decrypt(privateKeyB64, data) {
        if (4 != data[0] && 5 != data[0] || (null == data ? void 0 : data.length) < 88) throw "data format not support";
        let privateKey = base64js.toByteArray(privateKeyB64);
        if (32 != privateKey.length) throw "privateKey length must be 32";
        let iv = data.subarray(8, 24), mac = data.subarray(24, 56), tmpPub = data.subarray(56, 88), enc = data.subarray(88), dh = X25519.sharedKey(privateKey, tmpPub), kp = X25519.generateKeyPair(privateKey), hash64 = new Uint8Array(64);
        this.hashDH(dh, kp.public, tmpPub, hash64);
        let b2b = blake2b.blake2bInit(32, hash64.subarray(32, 64));
        blake2b.blake2bUpdate(b2b, iv), blake2b.blake2bUpdate(b2b, tmpPub), blake2b.blake2bUpdate(b2b, enc);
        let mac2 = blake2b.blake2bFinal(b2b);
        for (let i = 0; i < 32; i++) if (mac[i] != mac2[i]) throw "MAC NOT FIT";
        let dec = await this.aesDecrypt(hash64.subarray(0, 32), iv, enc);
        return 4 == data[0] ? await this.zlib.ungzip(dec) : dec;
    }
    hashDH(dh, pub1, pub2, dh64) {
        let shared96 = new Uint8Array(96);
        dh.forEach(((e, i) => {
            shared96[i] = e;
        }));
        let flag = 0;
        for (let i = 31; i >= 0; --i) {
            const element = pub1[i], element2 = pub2[i];
            if (element < element2) {
                flag = -1;
                break;
            }
            if (element > element2) {
                flag = 1;
                break;
            }
        }
        -1 == flag ? (pub1.forEach(((e, i) => {
            shared96[i + 32] = e;
        })), pub2.forEach(((e, i) => {
            shared96[i + 64] = e;
        }))) : (pub2.forEach(((e, i) => {
            shared96[i + 32] = e;
        })), pub1.forEach(((e, i) => {
            shared96[i + 64] = e;
        })));
        let b2b = blake2b.blake2bInit(64);
        blake2b.blake2bUpdate(b2b, shared96);
        let r = blake2b.blake2bFinal(b2b);
        r.forEach(((e, i) => {
            dh64[i] = e;
        })), shared96.fill(0), r.fill(0);
    }
    async encrypt(pubBase64, data, zipFist = !0) {
        if (zipFist) {
            let zipdata = await this.zlib.gzip(data);
            return this._encrypt(pubBase64, zipdata, !0);
        }
        return this._encrypt(pubBase64, data, !1);
    }
    async _encrypt(pubBase64, data, isZipData = !0) {
        let pubKey = base64js.toByteArray(pubBase64);
        if (32 != pubKey.length) throw "pubkey length error";
        let a = await this.genRandomKeyBuffer(32), kp = X25519.generateKeyPair(a), dh = X25519.sharedKey(kp.private, pubKey), hash2 = new Uint8Array(64);
        this.hashDH(dh, pubKey, kp.public, hash2), kp.private.fill(0);
        let key = hash2.subarray(0, 32), iv = await crypto.getRandomValues(new Uint8Array(16)), enc = await this.aesEncrypt(key, iv, data);
        var tmpPub = kp.public;
        let b2b = blake2b.blake2bInit(32, hash2.subarray(32, 64));
        blake2b.blake2bUpdate(b2b, iv), blake2b.blake2bUpdate(b2b, tmpPub), blake2b.blake2bUpdate(b2b, enc);
        let mac = blake2b.blake2bFinal(b2b), result = new Uint8Array(8 + mac.length + iv.length + tmpPub.length + enc.length);
        result[0] = isZipData ? 4 : 5, result[1] = 0, result[2] = 16, result[3] = 0, result[4] = 32, 
        result[5] = 0, result[6] = 32, result[7] = 0;
        let start = 8;
        return result.set(iv, start), start += iv.length, result.set(mac, start), start += mac.length, 
        result.set(tmpPub, start), start += tmpPub.length, result.set(enc, start), result;
    }
    async aesDecrypt(key, iv, data) {
        let p = {
            name: "AES-CBC",
            iv: iv
        }, keyObj = await subtle.importKey("raw", key, "AES-CBC", !1, [ "decrypt" ]);
        return new Uint8Array(await subtle.decrypt(p, keyObj, data));
    }
    async aesEncrypt(key, iv, data) {
        let p = {
            name: "AES-CBC",
            iv: iv,
            length: 256
        }, keyObj = await subtle.importKey("raw", key, p, !1, [ "encrypt" ]);
        return new Uint8Array(await subtle.encrypt(p, keyObj, data));
    }
}

export async function initEC() {
    return new EC;
}

exports.initEC = initEC;