const LANGS = { 'en': 'en', 'zh-CN': 'cn' };
const LANG_DIRS = { 'cn': 'zh-CN', 'en': 'en' };
const BLOCKED = ['_middleware.js', '_routes.json', 'netlify.toml', 'netlify', 'functions'];

function isWellKnown(path) {
  return path.startsWith('/.well-known/');
}

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

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (BLOCKED.some(b => path === '/' + b || path.startsWith('/' + b + '/'))) {
    return new Response('Not Found', { status: 404 });
  }

  if (isWellKnown(path)) return next();

  const parts = path.split('/').filter(Boolean);
  // If path already has lang dir (e.g. /cn/... or /en/...), strip it and set cookie
  if (parts.length > 0 && ['cn', 'en'].includes(parts[0])) {
    const newPath = '/' + parts.slice(1).join('/');
    const redirectUrl = new URL(newPath, request.url).toString();
    const langCookie = LANG_DIRS[parts[0]];
    return new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl,
        'Set-Cookie': `lang=${langCookie};path=/;max-age=31536000`
      }
    });
  }

  const cookie = parseCookie(request.headers.get('Cookie'), 'lang');
  let lang = null;
  if (cookie && LANGS[cookie]) {
    lang = LANGS[cookie];
  } else {
    lang = getLangFromAcceptLanguage(request.headers.get('Accept-Language'));
  }

  if (!lang) return next();

  const newPath = '/' + lang + '/' + parts.join('/');
  const newUrl = new URL(request.url);
  newUrl.pathname = newPath;

  const assetRequest = new Request(newUrl.toString(), request);
  const assetResponse = await env.ASSETS.fetch(assetRequest);

  if (assetResponse.status === 404) return next();
  return assetResponse;
}
