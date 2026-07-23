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

function beijingtime() {
  return new Date(Date.now() + 3600000 * 8)
    .toISOString()
    .replace('T', ' ')
    .replace('Z', ' +0800');
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
  minifyWhitespace: !isDev,
  minifyIdentifiers: false,
  minifySyntax: false,
  drop: isDev ? [] : ['console'],
  legalComments: isDev ? 'inline' : 'none',
  logLevel: 'warning',
  define: {
    __DEBUG__: isDev ? 'true' : 'false',
    __BUILD_TIME__: JSON.stringify(beijingtime()),
    __BUILD_MOD__: JSON.stringify(`${isDev ? 'DEBUG' : 'Release'}  ${getHash()}`),
  },
};

// --- tasks ---

// Compile each TS file to JS individually (no bundling), then concatenate into com.js
async function buildTS() {
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
  fs.writeFileSync('tmp/com.js', compiled.join('\n'));
  console.log('  buildTS done');
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

// Compile base64js.js and blake2b.js into libs.js (defines globals)
async function buildLibs() {
  mkdirp('tmp');
  const srcFiles = [
    'src/common/base64js.js',
    'src/common/blake2b.js',
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
  const msgPath = path.resolve(`src/html/i18n/${lang}/html-messages.ts`);
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

// --- main ---

async function main() {
  const t0 = Date.now();
  rmrf('tmp');
  rmrf('www');
  mkdirp('tmp');
  mkdirp('www');

  await buildTS();
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

  console.log(`Build done in ${Date.now() - t0}ms`);
}

main().catch(err => { console.error(err); process.exit(1); });
