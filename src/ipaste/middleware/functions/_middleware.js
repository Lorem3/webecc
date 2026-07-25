const LANGS = { 'en': 'en', 'zh-CN': 'cn' };
const LANG_DIRS = { 'cn': 'zh-CN', 'en': 'en' };
const BLOCKED = ['_middleware.js', '_routes.json', 'netlify.toml', 'netlify', 'functions'];

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
  // Skip the 'ipaste' prefix and check if next segment is a lang dir
  if (parts.length > 1 && parts[0] === 'ipaste' && ['cn', 'en'].includes(parts[1])) return null;
  // Insert lang dir after 'ipaste'
  u.pathname = '/ipaste/' + lang + '/' + parts.slice(1).join('/');
  return u.toString();
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (BLOCKED.some(b => path === '/ipaste/' + b || path.startsWith('/ipaste/' + b + '/'))) {
    return new Response('Not Found', { status: 404 });
  }

  const parts = path.split('/').filter(Boolean);
  // Check if path is under /ipaste/ and has lang dir (e.g. /ipaste/cn/... or /ipaste/en/...)
  if (parts.length > 1 && parts[0] === 'ipaste' && ['cn', 'en'].includes(parts[1])) {
    const newPath = '/ipaste/' + parts.slice(2).join('/');
    const redirectUrl = new URL(newPath, request.url).toString();
    const langCookie = LANG_DIRS[parts[1]];
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

  const newPath = '/ipaste/' + lang + '/' + parts.join('/');
  const newUrl = new URL(request.url);
  newUrl.pathname = newPath;

  const assetRequest = new Request(newUrl.toString(), request);
  const assetResponse = await env.ASSETS.fetch(assetRequest);

  if (assetResponse.status === 404) return next();
  return assetResponse;
}
