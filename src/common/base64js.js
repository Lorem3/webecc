"use strict";
var Base64 = (function () {
    function e() {}
    return (
      (e.prototype.byte2Char = function (e) {
        return (e &= 63) < 26
          ? String.fromCharCode(e + 65)
          : e < 52
            ? String.fromCharCode(e - 26 + 97)
            : e < 62
              ? String.fromCharCode(e - 52 + 48)
              : 62 == e
                ? "+"
                : "/";
      }),
      (e.prototype.char2byte = function (e) {
        return e >= 65 && e <= 90
          ? e - 65
          : e >= 97 && e <= 122
            ? e - 97 + 26
            : e >= 48 && e <= 57
              ? e - 48 + 52
              : 43 == e
                ? 62
                : 47 == e
                  ? 63
                  : 64;
      }),
      (e.prototype.encode = function (e, r, firstLineLess) {
        void 0 === r && (r = 0);
        void 0 === firstLineLess && (firstLineLess = 0);
        for (var t = "", o = 0, n = e.length, a = 0, s = 0; s < n; s++) {
          var i = e[s];
          switch (s % 3) {
            case 0:
              ((t += this.byte2Char(i >> 2)),
                (o = (i << 4) & 63),
                ++a && r && a % r == 0 && (t += "\r\n"));
              break;
            case 1:
              ((t += this.byte2Char((i >> 4) | o)),
                (o = (i << 2) & 63),
                ++a && r && a % r == 0 && (t += "\r\n"));
              break;
            case 2:
              ((t += this.byte2Char((i >> 6) | o)),
                ++a && r && a % r == 0 && (t += "\r\n"),
                (t += this.byte2Char(i)),
                ++a && r && a % r == 0 && (t += "\r\n"));
          }
        }
        var c = n % 3;
        if (0 != c) {
          t += this.byte2Char(o);
          t += 1 == c ? "==" : "=";
        }
        if (r > 0 && firstLineLess > 0) {
          var raw = t.replace(/\r\n/g, "");
          var firstLineLen = r - firstLineLess;
          if (firstLineLen > 0 && raw.length > firstLineLen) {
            var parts = [];
            for (var pos = 0; pos < raw.length; pos += r) {
              parts.push(raw.substring(pos, pos + r));
            }
            if (parts.length > 0) {
              parts[0] = raw.substring(0, firstLineLen);
              var rebuild = [parts[0]];
              var remaining = raw.substring(firstLineLen);
              for (var pos2 = 0; pos2 < remaining.length; pos2 += r) {
                rebuild.push(remaining.substring(pos2, pos2 + r));
              }
              t = rebuild.join("\r\n");
            }
          }
        }
        return t;
      }),
      (e.prototype.decode = function (e) {
        for (
          var r = new TextEncoder().encode(e),
            t = new Uint8Array(r.length),
            o = r.length,
            n = 0,
            a = 0,
            s = 0,
            i = 0,
            c = 64;
          n < o;
        ) {
          c = 64;
          do {
            ((c = this.char2byte(r[n])), n++);
          } while (64 == c && n < o);
          if (!(c < 64)) break;
          switch (3 & i) {
            case 0:
              s = c << 2;
              break;
            case 1:
              var h = s | (c >> 4);
              ((s = c << 4), (t[a++] = h));
              break;
            case 2:
              var y = s | (c >> 2);
              ((s = c << 6), (t[a++] = y));
              break;
            case 3:
              t[a++] = s | c;
          }
          i++;
        }
        return t.slice(0, a);
      }),
      (e.prototype.toByteArray = function (e) {
        return this.decode(e);
      }),
      (e.prototype.fromByteArray = function (e, r, firstLineLess) {
        return (void 0 === r && (r = 0), void 0 === firstLineLess && (firstLineLess = 0), this.encode(e, r, firstLineLess));
      }),
      e
    );
  })(),
  base64js = new Base64();
