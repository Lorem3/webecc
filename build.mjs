#!/usr/bin/env node
import { build } from 'esbuild';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const isDev = process.argv[2] === 'dev';
const LANGS = ['cn', 'en'];

// --- helpers ---

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cp(src, dest) {
  fs.copyFileSync(src, dest);
}

function utctime() {
  return new Date().toISOString();
}

function getHash() {
  try {
    const commit = fs.readFileSync('hash.txt', 'utf8').trim();
    return `cmt: ${commit}`;
  } catch {
    return '--';
  }
}

const esbuildOpts = {
  target: 'es2020',
  charset: 'utf8',
  minifyWhitespace: false,
  minifyIdentifiers: false,
  minifySyntax: false,
  drop: isDev ? [] : ['console'],
  legalComments: isDev ? 'inline' : 'none',
  logLevel: 'warning',
  define: {
    __DEBUG__: isDev ? 'true' : 'false',
    __BUILD_TIME__: JSON.stringify(utctime()),
    __BUILD_MOD__: JSON.stringify(`${isDev ? 'DEBUG' : 'Release'}  ${getHash()}`),
  },
};

// --- tasks ---

// Compile each TS file to JS individually (no bundling), then concatenate into com.js
// 使用 ec-new.ts（精简版，不包含 blake2b）
async function buildTSCore() {
  mkdirp('tmp');
  const srcFiles = [
    'src/common/x25519.ts',
    'src/common/ec-new.ts',
  ];
  const compiled = [];
  for (const file of srcFiles) {
    const result = await build({
      entryPoints: [file],
      bundle: false,
      write: false,
      ...esbuildOpts,
    });
    compiled.push(result.outputFiles[0].text);
  }
  fs.writeFileSync('tmp/com.js', compiled.join('\n'));
  console.log('  buildTSCore done');
}

// 使用 ec.ts 完整版（包含 blake2b，用于 legacy 页面）
async function buildTSLegacy() {
  mkdirp('tmp');
  const srcFiles = [
    'src/common/x25519.ts',
    'src/common/ec.ts',
  ];
  const compiled = [];
  for (const file of srcFiles) {
    const result = await build({
      entryPoints: [file],
      bundle: false,
      write: false,
      ...esbuildOpts,
    });
    compiled.push(result.outputFiles[0].text);
  }
  fs.writeFileSync('tmp/com-legacy.js', compiled.join('\n'));
  console.log('  buildTSLegacy done');
}

// Bundle index.ts with i18n alias for a specific language
async function buildIndex(lang) {
  mkdirp('tmp');
  const i18nPath = path.resolve(`src/html/i18n/${lang}/js-messages.ts`);
  const result = await build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    write: false,
    alias: {
      '@i18n/js-messages': i18nPath,
    },
    ...esbuildOpts,
  });
  fs.writeFileSync(`tmp/index.${lang}.js`, result.outputFiles[0].text);
  console.log(`  buildIndex(${lang}) done`);
}

// Compile base64js.js and squircle.js into libs.js (defines globals)
// 不包含 blake2b，用于 ipaste 和 index
async function buildLibs() {
  mkdirp('tmp');
  const srcFiles = [
    'src/common/base64js.js',
    'src/common/curve25519.js',
    'src/common/squircle.js',
  ];
  const compiled = [];
  for (const file of srcFiles) {
    const result = await build({
      entryPoints: [file],
      bundle: false,
      write: false,
      ...esbuildOpts,
    });
    compiled.push(result.outputFiles[0].text);
  }
  fs.writeFileSync('tmp/libs.js', compiled.join('\n'));
  console.log('  buildLibs done');
}

// 编译 base64js.js, blake2b.js, 和 squircle.js 到 libs-legacy.js（包含 blake2b）
// 用于 legacy 页面
async function buildLibsLegacy() {
  mkdirp('tmp');
  const srcFiles = [
    'src/common/base64js.js',
    'src/common/blake2b.js',
    'src/common/curve25519.js',
    'src/common/squircle.js',
  ];
  const compiled = [];
  for (const file of srcFiles) {
    const result = await build({
      entryPoints: [file],
      bundle: false,
      write: false,
      ...esbuildOpts,
    });
    compiled.push(result.outputFiles[0].text);
  }
  fs.writeFileSync('tmp/libs-legacy.js', compiled.join('\n'));
  console.log('  buildLibsLegacy done');
}

async function buildTest() {
  mkdirp('tmp');
  const result = await build({
    entryPoints: ['src/test.ts'],
    bundle: false,
    write: false,
    ...esbuildOpts,
  });
  fs.writeFileSync('tmp/test.js', result.outputFiles[0].text);
  console.log('  buildTest done');
}

// Load i18n messages for HTML replacement (compile TS first, then eval)
async function loadHtmlMessages(lang) {
  return loadHtmlMessagesForPath(`src/html/i18n/${lang}/html-messages.ts`);
}

async function loadHtmlMessagesForPath(msgPath) {
  const result = await build({
    entryPoints: [msgPath],
    bundle: false,
    write: false,
    target: 'es2020',
    format: 'esm',
  });
  const js = result.outputFiles[0].text
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s+/gm, '');
  const fn = new Function(js + '; return htmlMessages;');
  return fn();
}

// Replace {{i18n:key}} placeholders in HTML
function replaceI18n(html, messages) {
  return html.replace(/\{\{i18n:(\w+)\}\}/g, (_, key) => {
    if (key in messages) return messages[key];
    console.warn(`  [WARN] Missing i18n key: ${key}`);
    return `[[MISSING:${key}]]`;
  });
}

function cssMin(lang) {
  mkdirp(`www/${lang}/css`);
  if (isDev) {
    cp('css/style.css', `www/${lang}/css/style.min.css`);
    console.log(`  cssMin(${lang}) skipped (dev)`);
  } else {
    execSync(`npx esbuild css/style.css --minify --outfile=www/${lang}/css/style.min.css`, { stdio: 'inherit' });
    console.log(`  cssMin(${lang}) done`);
  }
}

function genReadMe() {
  // README is language-neutral, put in root
  mkdirp('www');
  try {
    const showdown = require('showdown');
    const converter = new showdown.Converter({ tables: true, strikethrough: true });
    const md = fs.readFileSync('README.md', 'utf8');
    const css = fs.readFileSync('css/readme.css', 'utf8');
    const html = `<html><style>\n${css}\n</style>\n${converter.makeHtml(md)}</html>`;
    fs.writeFileSync('www/README.html', html);
    console.log('  genReadMe done');
  } catch (e) {
    console.log('  genReadMe skipped:', e.message);
  }
}

function wrapIIFE(...parts) {
  return `(function () {\n${parts.join('\n')}\n})();`;
}

function inlineHtml(lang) {
  const htmlPath = `www/${lang}/index.html`;
  const cssPath = `www/${lang}/css/style.min.css`;
  const libsPath = 'tmp/libs.js';
  const comJsPath = 'tmp/com.js';
  const indexJsPath = `tmp/index.${lang}.js`;

  const css = fs.readFileSync(cssPath, 'utf8');
  const libs = fs.readFileSync(libsPath, 'utf8');
  const comJs = fs.readFileSync(comJsPath, 'utf8');
  const indexJs = fs.readFileSync(indexJsPath, 'utf8');

  // index.html: inline CSS and JS (libs.js provides base64js/blake2b globals)
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(
    /<link\s+rel="stylesheet"\s+type="text\/css"\s+href="css\/style\.min\.css"\s*\/>/,
    `<style>\n${css}\n</style>`
  );
  html = html.replace(
    /<script\s+src="js\/app\.js"><\/script>/,
    `<script>\n${wrapIIFE(libs, comJs, indexJs)}\n</script>`
  );
  fs.writeFileSync(htmlPath, html);
  console.log(`  inlineHtml(${lang}) done`);
}

async function buildLangPages(lang) {
  const outDir = `www/${lang}`;
  mkdirp(outDir);

  const messages = await loadHtmlMessages(lang);

  // Copy and process index.html with i18n replacement
  const indexSrc = 'src/html/index.html';
  let indexHtml = fs.readFileSync(indexSrc, 'utf8');
  indexHtml = replaceI18n(indexHtml, messages);
  fs.writeFileSync(path.join(outDir, 'index.html'), indexHtml);

  // Copy fmt.html and d1.html from language directory (or fallback to cn)
  for (const file of ['fmt.html', 'd1.html']) {
    const langPath = `src/html/${lang}/${file}`;
    const cnPath = `src/html/cn/${file}`;
    const src = fs.existsSync(langPath) ? langPath : cnPath;
    cp(src, path.join(outDir, file));
  }

  console.log(`  buildLangPages(${lang}) done`);
}

// test.html is shared across languages (not internationalized)
function buildTestHtml() {
  const cssPath = 'www/cn/css/style.min.css';
  const libsPath = 'tmp/libs.js';
  const comJsPath = 'tmp/com.js';
  const testJsPath = 'tmp/test.js';

  const css = fs.readFileSync(cssPath, 'utf8');
  const libs = fs.readFileSync(libsPath, 'utf8');
  const comJs = fs.readFileSync(comJsPath, 'utf8');
  const testJs = fs.readFileSync(testJsPath, 'utf8');

  let testHtml = fs.readFileSync('src/html/cn/test.html', 'utf8');
  testHtml = testHtml.replace(
    /<link\s+rel="stylesheet"\s+type="text\/css"\s+href="css\/style\.min\.css"\s*\/>/,
    `<style>\n${css}\n</style>`
  );
  testHtml = testHtml.replace(
    /<script\s+src="js\/app\.js"><\/script>/,
    `<script>\n${wrapIIFE(libs, comJs, testJs)}\n</script>`
  );
  fs.writeFileSync('www/test.html', testHtml);
  console.log('  buildTestHtml done');
}

// --- index-legacy ---

async function buildIndexLegacy() {
  mkdirp('tmp');
  const i18nPath = path.resolve(`src/html/i18n/cn/js-messages.ts`);
  const result = await build({
    entryPoints: ['src/index-legacy.ts'],
    bundle: true,
    write: false,
    alias: {
      '@i18n/js-messages': i18nPath,
    },
    ...esbuildOpts,
  });
  fs.writeFileSync('tmp/index-legacy.js', result.outputFiles[0].text);
  console.log('  buildIndexLegacy done');
}

async function buildLegacyLangPages(lang) {
  const outDir = `www/${lang}`;
  mkdirp(outDir);

  // 复制 index-legacy.html 到每个语言目录
  const legacySrc = 'src/html/index-legacy.html';
  const legacyDest = path.join(outDir, 'index-legacy.html');

  // 读取消息用于 i18n 替换
  const messagesPath = `src/html/i18n/${lang}/html-messages.ts`;
  let messages = {};
  try {
    const result = await build({
      entryPoints: [messagesPath],
      bundle: false,
      write: false,
      target: 'es2020',
      format: 'esm',
    });
    const js = result.outputFiles[0].text
      .replace(/^import\s+.*$/gm, '')
      .replace(/^export\s+/gm, '');
    const fn = new Function(js + '; return htmlMessages;');
    messages = fn();
  } catch (e) {
    console.warn(`  [WARN] Could not load messages for ${lang}:`, e.message);
  }

  let html = fs.readFileSync(legacySrc, 'utf8');
  html = replaceI18n(html, messages);
  fs.writeFileSync(legacyDest, html);
  console.log(`  buildLegacyLangPages(${lang}) done`);
}

function inlineLegacyHtml(lang) {
  const htmlPath = `www/${lang}/index-legacy.html`;
  const cssPath = `www/${lang}/css/style.min.css`;
  const libsPath = 'tmp/libs-legacy.js';
  const comJsPath = 'tmp/com-legacy.js';
  const indexLegacyJsPath = 'tmp/index-legacy.js';

  if (!fs.existsSync(htmlPath)) {
    console.log(`  inlineLegacyHtml(${lang}) skipped (file not found)`);
    return;
  }

  const css = fs.readFileSync(cssPath, 'utf8');
  const libs = fs.readFileSync(libsPath, 'utf8');
  const comJs = fs.readFileSync(comJsPath, 'utf8');
  const indexLegacyJs = fs.readFileSync(indexLegacyJsPath, 'utf8');

  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(
    /<link\s+rel="stylesheet"\s+type="text\/css"\s+href="css\/style\.min\.css"\s*\/>/,
    `<style>\n${css}\n</style>`
  );
  html = html.replace(
    /<script\s+src="js\/app\.js"><\/script>/,
    `<script>\n${wrapIIFE(libs, comJs, indexLegacyJs)}\n</script>`
  );
  fs.writeFileSync(htmlPath, html);
  console.log(`  inlineLegacyHtml(${lang}) done`);
}

// --- ipaste ---

async function buildIPasteIndex(lang) {
  mkdirp('tmp');
  const i18nJsPath = path.resolve(`src/ipaste/i18n/${lang}/js-messages.ts`);
  const i18nHtmlPath = path.resolve(`src/ipaste/i18n/${lang}/html-messages.ts`);
  const result = await build({
    entryPoints: ['src/ipaste/index.ts'],
    bundle: true,
    write: false,
    alias: {
      '@i18n/js-messages': i18nJsPath,
      '@i18n/html-messages': i18nHtmlPath,
    },
    ...esbuildOpts,
  });
  fs.writeFileSync(`tmp/ipaste.${lang}.js`, result.outputFiles[0].text);
  console.log(`  buildIPasteIndex(${lang}) done`);
}

async function buildIPastePages(lang) {
  const outDir = `www/ipaste/${lang}`;
  mkdirp(outDir);
  const messages = await loadHtmlMessagesForPath(`src/ipaste/i18n/${lang}/html-messages.ts`);

  let html = fs.readFileSync('src/ipaste/index.html', 'utf8');
  html = replaceI18n(html, messages);
  fs.writeFileSync(path.join(outDir, 'index.html'), html);

  // Copy fmt.html from language directory (or fallback to cn)
  for (const file of ['fmt.html']) {
    const langPath = `src/html/${lang}/${file}`;
    const cnPath = `src/html/cn/${file}`;
    const src = fs.existsSync(langPath) ? langPath : cnPath;
    cp(src, path.join(outDir, file));
  }

  console.log(`  buildIPastePages(${lang}) done`);
}

function inlineIPasteHtml(lang) {
  const htmlPath = `www/ipaste/${lang}/index.html`;
  const cssPath = `www/${lang}/css/style.min.css`;
  const libsPath = 'tmp/libs.js';
  const comJsPath = 'tmp/com.js';
  const ipasteJsPath = `tmp/ipaste.${lang}.js`;

  const css = fs.readFileSync(cssPath, 'utf8');
  const libs = fs.readFileSync(libsPath, 'utf8');
  const comJs = fs.readFileSync(comJsPath, 'utf8');
  const ipasteJs = fs.readFileSync(ipasteJsPath, 'utf8');

  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(
    /<link\s+rel="stylesheet"\s+type="text\/css"\s+href="css\/style\.min\.css"\s*\/>/,
    `<style>\n${css}\n</style>`
  );
  html = html.replace(
    /<script\s+src="js\/app\.js"><\/script>/,
    `<script>\n${wrapIIFE(libs, comJs, ipasteJs)}\n</script>`
  );
  fs.writeFileSync(htmlPath, html);
  console.log(`  inlineIPasteHtml(${lang}) done`);
}

// --- main ---

async function main() {
  const t0 = Date.now();
  rmrf('tmp');
  rmrf('www');
  mkdirp('tmp');
  mkdirp('www');

  // Copy Functions for Cloudflare Pages
  mkdirp('www/functions');
  cp('src/middleware/functions/_middleware.js', 'www/functions/_middleware.js');

  // Copy ipaste Functions for Cloudflare Pages
  mkdirp('www/ipaste/functions');
  cp('src/ipaste/middleware/functions/_middleware.js', 'www/ipaste/functions/_middleware.js');

  // Copy Edge Function files for Netlify
  mkdirp('www/netlify/edge-functions');
  cp('src/middleware/netlify-i18n.js', 'www/netlify/edge-functions/i18n.js');
  cp('src/middleware/netlify.toml', 'www/netlify.toml');
  console.log('  middleware files copied');

  // 构建 ipaste 和 index 使用 ec-new（不包含 blake2b）
  await buildTSCore();
  await buildLibs();
  await buildTest();
  cssMin('cn');
  cssMin('en');

  for (const lang of LANGS) {
    await buildIndex(lang);
    await buildLangPages(lang);
  }

  genReadMe();
  buildTestHtml();

  for (const lang of LANGS) {
    inlineHtml(lang);
  }

  // 构建 legacy 版本
  await buildTSLegacy();
  await buildLibsLegacy();
  await buildIndexLegacy();

  // 构建 legacy 页面
  for (const lang of LANGS) {
    await buildLegacyLangPages(lang);
  }

  // 内联 legacy HTML
  for (const lang of LANGS) {
    inlineLegacyHtml(lang);
  }

  // Build ipaste pages
  for (const lang of LANGS) {
    await buildIPasteIndex(lang);
    await buildIPastePages(lang);
  }
  for (const lang of LANGS) {
    inlineIPasteHtml(lang);
  }

  // Copy ipaste cn files to ipaste root as GitHub Pages fallback
  const ipasteCnDir = 'www/ipaste/cn';
  if (fs.existsSync(ipasteCnDir)) {
    const ipasteCnFiles = fs.readdirSync(ipasteCnDir, { withFileTypes: true });
    for (const file of ipasteCnFiles) {
      const src = `${ipasteCnDir}/${file.name}`;
      const dest = `www/ipaste/${file.name}`;
      if (!fs.existsSync(dest)) {
        if (file.isDirectory()) {
          fs.cpSync(src, dest, { recursive: true });
        } else {
          cp(src, dest);
        }
      }
    }
    console.log('  ipaste cn fallback files copied');
  }

  // Copy cn files to root as GitHub Pages fallback (don't overwrite existing)
  const cnFiles = fs.readdirSync('www/cn', { withFileTypes: true });
  for (const file of cnFiles) {
    const src = `www/cn/${file.name}`;
    const dest = `www/${file.name}`;
    if (!fs.existsSync(dest)) {
      if (file.isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
      } else {
        cp(src, dest);
      }
    }
  }
  console.log('  cn fallback files copied');

  console.log(`Build done in ${Date.now() - t0}ms`);
}

main().catch(err => { console.error(err); process.exit(1); });
