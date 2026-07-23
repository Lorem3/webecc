const LANGS = { 'en': 'en', 'zh-CN': 'cn' };
const BLOCKED = ['_middleware.js', '_routes.json', 'netlify.toml', 'netlify'];

function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getLangFromAcceptLanguage(acceptLanguage) {
  if (!acceptLanguage) return null;
  const preferred = acceptLanguage
    .split(',')
    .map(item => {
      const [lang, q] = item.trim().split(';q=');
      return { lang: lang.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of preferred) {
    if (lang === 'zh' || lang.startsWith('zh-')) return 'cn';
    if (lang === 'en' || lang.startsWith('en-')) return 'en';
  }
  return null;
}

function rewriteUrl(url, lang) {
  const u = new URL(url);
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length > 0 && ['cn', 'en'].includes(parts[0])) return null;
  u.pathname = `/${lang}/` + parts.join('/');
  return u.toString();
}

export default async (request, context) => {
  const path = new URL(request.url).pathname;
  if (BLOCKED.some(b => path === '/' + b || path.startsWith('/' + b + '/'))) {
    return new Response('Not Found', { status: 404 });
  }
  const cookie = parseCookie(request.headers.get('cookie'), 'lang');
  let lang = null;
  if (cookie && LANGS[cookie]) {
    lang = LANGS[cookie];
  } else {
    lang = getLangFromAcceptLanguage(request.headers.get('accept-language'));
  }
  if (!lang) return context.next();
  const newUrl = rewriteUrl(request.url, lang);
  if (!newUrl) return context.next();
  return context.next(new Request(newUrl, request));
};

export const config = { path: '/*' };
