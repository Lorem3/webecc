#!/usr/bin/env node
import { build } from 'esbuild';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const isDev = process.argv[2] === 'dev';

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
  minify: false,
  drop: isDev ? [] : ['console'],
  legalComments: 'none',
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
    'src/common/base64js.js',
    'src/common/blake2b.js',
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

// Compile index.ts and test.ts individually
async function buildIndex() {
  mkdirp('tmp');
  const result = await build({
    entryPoints: ['src/index.ts'],
    bundle: false,
    write: false,
    ...esbuildOpts,
  });
  fs.writeFileSync('tmp/index.js', result.outputFiles[0].text);
  console.log('  buildIndex done');
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

function cpTemplate() {
  mkdirp('www');
  cp('src/html/index.html', 'www/index.html');
  cp('src/html/fmt.html', 'www/fmt.html');
  console.log('  cpTemplate done');
}

function cssMin() {
  mkdirp('www/css');
  execSync('npx esbuild css/style.css --minify --outfile=www/css/style.min.css', { stdio: 'inherit' });
  console.log('  cssMin done');
}

function genReadMe() {
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

function inlineHtml() {
  const htmlPath = 'www/index.html';
  const cssPath = 'www/css/style.min.css';
  const comJsPath = 'tmp/com.js';
  const indexJsPath = 'tmp/index.js';

  const css = fs.readFileSync(cssPath, 'utf8');
  const comJs = fs.readFileSync(comJsPath, 'utf8');
  const indexJs = fs.readFileSync(indexJsPath, 'utf8');

  // index.html: single inlined <script> = IIFE(com.js + index.js)
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(
    /<link\s+rel="stylesheet"\s+type="text\/css"\s+href="css\/style\.min\.css"\s*\/>/,
    `<style>\n${css}\n</style>`
  );
  html = html.replace(
    /<script\s+src="js\/app\.js"><\/script>/,
    `<script>\n${wrapIIFE(comJs, indexJs)}\n</script>`
  );
  fs.writeFileSync(htmlPath, html);
  console.log('  inlineHtml done');

  // test.html: single inlined <script> = IIFE(com.js + test.js)
  const testJs = fs.readFileSync('tmp/test.js', 'utf8');
  let testHtml = fs.readFileSync('src/html/test.html', 'utf8');
  testHtml = testHtml.replace(
    /<link\s+rel="stylesheet"\s+type="text\/css"\s+href="css\/style\.min\.css"\s*\/>/,
    `<style>\n${css}\n</style>`
  );
  testHtml = testHtml.replace(
    /<script\s+src="js\/app\.js"><\/script>/,
    `<script>\n${wrapIIFE(comJs, testJs)}\n</script>`
  );
  fs.writeFileSync('www/test.html', testHtml);
  console.log('  inlineTestHtml done');
}

// --- main ---

async function main() {
  const t0 = Date.now();
  rmrf('tmp');
  mkdirp('tmp');
  mkdirp('www');

  await buildTS();
  await buildIndex();
  await buildTest();
  cpTemplate();
  cssMin();
  genReadMe();
  inlineHtml();

  console.log(`Build done in ${Date.now() - t0}ms`);
}

main().catch(err => { console.error(err); process.exit(1); });
