// src/ の可読ソース → public/ の配布物を生成するビルドスクリプト
//   - JavaScript は terser で minify
//   - Liquid Glass は独立した minify 済みファイルとして出力
//   - メインアプリは Base64 化して obf/ に出力
// 実行: node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { minify } from 'terser';
import JavaScriptObfuscator from 'javascript-obfuscator';

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
function obfuscateJs(code, name) {
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
    }).getObfuscatedCode();
  } catch (error) {
    throw new Error(`${name}: 難読化に失敗しました (${error.message})`);
  }
}

/** terser で minify したあと、難読化を施す */
async function buildJs(code, name) {
  return obfuscateJs(await minifyJs(code, name), name);
}

/** インライン <script> ブロックをすべて minify + 難読化する */
async function minifyInlineScripts(html, name) {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  let output = html;
  for (let index = 0; index < blocks.length; index++) {
    const code = await buildJs(blocks[index][1], `${name} script #${index + 1}`);
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

  console.log(
    `public/index.html: ${indexHtml.length} bytes / ` +
    `public/liquid-glass.js: ${liquidGlass.length} bytes / ` +
    `public/obf/index: ${base64.length} bytes (${appHtml.length} bytes → base64)`,
  );
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
