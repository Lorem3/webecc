const Squircle = {
  path: function(w, h, r, n, steps) {
    n = n || 5;
    steps = steps || 24;
    r = Math.min(r, w / 2, h / 2);

    function corner(cx, cy, sx, sy, reverse) {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = (Math.PI / 2) * (i / steps);
        const px = cx + sx * r * Math.pow(Math.sin(t), 2 / n);
        const py = cy + sy * r * Math.pow(Math.cos(t), 2 / n);
        pts.push([px, py]);
      }
      return reverse ? pts.reverse() : pts;
    }

    const tl = corner(r, r, -1, -1, true);
    const tr = corner(w - r, r, 1, -1, false);
    const br = corner(w - r, h - r, 1, 1, true);
    const bl = corner(r, h - r, -1, 1, false);

    const all = [...tl, ...tr, ...br, ...bl];

    let d = 'M ' + all[0][0].toFixed(2) + ' ' + all[0][1].toFixed(2) + ' ';
    for (let i = 1; i < all.length; i++) {
      d += 'L ' + all[i][0].toFixed(2) + ' ' + all[i][1].toFixed(2) + ' ';
    }
    d += 'Z';
    return d;
  },

  svg: function(w, h, r, n, color, border) {
    const d = this.path(w, h, r, n || 5);
    const fill = color || 'white';
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">';
    svg += '<path d="' + d + '" fill="' + fill + '"';
    if (border) {
      svg += ' stroke="' + border.color + '" stroke-width="' + border.width + '"';
    }
    svg += '/></svg>';
    return svg;
  },

  url: function(w, h, r, n, color, border) {
    return 'url("data:image/svg+xml,' + encodeURIComponent(this.svg(w, h, r, n, color, border)) + '")';
  },

  apply: function(el, r, n, border) {
    const rect = el.getBoundingClientRect();
    const w = Math.max(rect.width, 1);
    const h = Math.max(rect.height, 1);
    const bgColor = getComputedStyle(el).backgroundColor || '#000000';
    const bgUrl = this.url(w, h, r, n, bgColor, border);
    el.style.backgroundImage = bgUrl;
    el.style.backgroundSize = '100% 100%';
    el.style.backgroundColor = 'transparent';
    el.style.borderRadius = '0';
    el.style.border = 'none';
  },

  applyAll: function(selector, r, n, border) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => this.apply(el, r, n, border));
  }
};

document.addEventListener('DOMContentLoaded', function() {
  Squircle.applyAll('.btn', 30, 5);
  Squircle.applyAll('.section-card', 60, 5, { color: '#e3e6ea', width: 1 });
  Squircle.applyAll('.contain', 90, 5, { color: '#e3e6ea', width: 1 });
  Squircle.applyAll('input[type="text"]', 30, 5, { color: '#e3e6ea', width: 1 });
  Squircle.applyAll('input[type="password"]', 30, 5, { color: '#e3e6ea', width: 1 });
});
