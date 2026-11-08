// src/ の可読ソース → public/ の配布物を生成するビルドスクリプト
//   - JavaScript は terser で minify
//   - Liquid Glass は独立した minify 済みファイルとして出力
//   - メインアプリは Base64 化して obf/ に出力
// 実行: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { minify } from 'terser';
import JavaScriptObfuscator from 'javascript-obfuscator';

const REPO = 'zenith-kamo/sumi';
const BRANCH = 'main';
// 画像の扱い: デフォルトは Base64 埋め込み。--cdn で jsDelivr 参照に切り替え
const ASSET_MODE = process.argv.includes('--cdn') ? 'cdn' : 'base64';

const root = new URL('./', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const write = (path, data) => writeFileSync(new URL(path, root), data);

async function minifyJs(code, name) {
  const result = await minify(code, {
    compress: true,
    mangle: true,
    format: { comments: false },
  });
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  return result.code;
}

/** 中程度の難読化: 文字列配列・制御フロー変換・デッドコード挿入を組み合わせる */
function obfuscateJs(code, name, overrides = {}) {
  try {
    return JavaScriptObfuscator.obfuscate(code, {
      compact: true,
      target: 'browser',
      seed: 12345,
      identifierNamesGenerator: 'hexadecimal',
      renameGlobals: false,
      selfDefending: false,
      debugProtection: false,
      disableConsoleOutput: false,
      stringArray: true,
      stringArrayThreshold: 0.65,
      stringArrayEncoding: ['base64'],
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 1,
      stringArrayWrappersType: 'function',
      splitStrings: true,
      splitStringsChunkLength: 12,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.35,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.1,
      numbersToExpressions: true,
      simplify: true,
      unicodeEscapeSequence: false,
      ...overrides,
    }).getObfuscatedCode();
  } catch (error) {
    throw new Error(`${name}: 難読化に失敗しました (${error.message})`);
  }
}

/** terser で minify したあと、難読化を施す */
async function buildJs(code, name, overrides) {
  return obfuscateJs(await minifyJs(code, name), name, overrides);
}

/** インライン <script> ブロックをすべて minify + 難読化する */
async function minifyInlineScripts(html, name, overrides) {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  let output = html;
  for (let index = 0; index < blocks.length; index++) {
    const code = await buildJs(blocks[index][1], `${name} script #${index + 1}`, overrides);
    output = output.replace(blocks[index][0], () => `<script>${code}</script>`);
  }
  return output;
}

async function build() {
  const liquidGlass = await buildJs(read('src/liquid-glass.js'), 'liquid-glass.js');
  const bootstrapJs = await buildJs(read('src/script.js'), 'script.js');
  const css = read('src/style.css');

  // 1) Liquid Glass は独立した minify 済みファイルとして配信
  write('public/liquid-glass.js', liquidGlass);

  // 2) ブートストラップ: CSS をインライン化（JSは外部参照のまま）
  let indexHtml = read('src/index.html');
  indexHtml = indexHtml.replace(
    '<link rel="stylesheet" href="style.css">',
    () => `<style>${css}</style>`,
  );
  indexHtml = indexHtml.replace(
    '<script src="script.js"></script>',
    () => `<script>${bootstrapJs}</script>`,
  );
  write('public/index.html', indexHtml);

  // 3) メインアプリ: インライン JS のみ minify して Base64 化
  const appHtml = await minifyInlineScripts(read('src/app.html'), 'app.html');
  const base64 = Buffer.from(appHtml, 'utf8').toString('base64');

  mkdirSync(new URL('public/obf/', root), { recursive: true });
  write('public/obf/index', base64);
  write('public/obf/app', base64);

  // 4) singlefile: すべてを 1 つの HTML に埋め込む
  const singleHtml = await buildSingle({ liquidGlass, bootstrapJs, css });
  write('public/single.html', singleHtml);

  console.log(
    `public/index.html: ${indexHtml.length} bytes / ` +
    `public/liquid-glass.js: ${liquidGlass.length} bytes / ` +
    `public/obf/index: ${base64.length} bytes (${appHtml.length} bytes → base64) / ` +
    `public/single.html: ${singleHtml.length} bytes (assets: ${ASSET_MODE})`,
  );
}

/** singlefile 用のアセット表（キー: ファイル名, 値: データURI or CDN URL） */
function buildAssetMap() {
  const files = readdirSync(new URL('public/img/', root)).map((file) => ({
    key: file,
    path: `public/img/${file}`,
    cdn: `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/public/img/${file}`,
  }));
  files.push({
    key: 'favicon.png',
    path: 'public/favicon.png',
    cdn: `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/public/favicon.png`,
  });

  const assets = {};
  for (const { key, path, cdn } of files) {
    if (ASSET_MODE === 'cdn') {
      assets[key] = cdn;
    } else {
      const type = key.endsWith('.svg') ? 'svg+xml' : 'png';
      assets[key] = `data:image/${type};base64,${readFileSync(new URL(path, root)).toString('base64')}`;
    }
  }
  return assets;
}

/** singlefile 用のアプリ本体（ライブラリはブートストラップ側のグローバルを利用） */
async function buildSingleApp(assets) {
  let appHtml = read('src/app.html');
  // 同一ウィンドウ上で先行ロード済みの LiquidGlass を利用するため外部参照を削除
  appHtml = appHtml.replace('<script src="liquid-glass.js"></script>', '');

  // 画像は JS 文字列に埋めめず、グローバルな __ASSETS 参照に置き換える
  for (const key of Object.keys(assets)) {
    appHtml = appHtml.split(`'./img/${key}'`).join(`__ASSETS['${key}']`);
    appHtml = appHtml.split(`"./img/${key}"`).join(`__ASSETS['${key}']`);
  }
  appHtml = appHtml.split("'./favicon.png'").join("__ASSETS['favicon.png']");
  appHtml = appHtml.split('"./favicon.png"').join("__ASSETS['favicon.png']");

  return minifyInlineScripts(appHtml, 'single app');
}

/** 1ファイルで完結する HTML を組み立てる */
async function buildSingle({ liquidGlass, bootstrapJs, css }) {
  const assets = buildAssetMap();
  const appBase64 = Buffer.from(await buildSingleApp(assets), 'utf8').toString('base64');
  const favicon = assets['favicon.png'];

  let html = read('src/index.html');
  html = html.replace(
    /<link rel="icon"[^>]*>\s*/g,
    () => '',
  );
  html = html.replace(
    '<link rel="apple-touch-icon" href="favicon.png" />',
    () => `<link rel="apple-touch-icon" href="${favicon}" />`,
  );
  html = html.replace(
    '<link rel="stylesheet" href="style.css">',
    () => `<link rel="icon" type="image/png" href="${favicon}">\n<style>${css}</style>`,
  );
  html = html.replace(
    '<script src="liquid-glass.js"></script>',
    () => `<script>window.__ASSETS=${JSON.stringify(assets)}</script>\n<script type="text/plain" id="app-data">${appBase64}</script>\n<script>${liquidGlass}</script>`,
  );
  html = html.replace(
    '<script src="script.js"></script>',
    () => `<script>${bootstrapJs}</script>`,
  );
  return html;
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
