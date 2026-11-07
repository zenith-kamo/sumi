// src/ の可読ソース → public/ の配布物を生成するビルドスクリプト
//   - JavaScript は terser で minify
//   - メインアプリは 1ファイルに結合して Base64 化
// 実行: node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { minify } from 'terser';

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

/** 外部スクリプトタグをインラインの minify 済みコードに置き換える */
function inlineExternalScript(html, srcFile, code) {
  const pattern = new RegExp(`<script src="${srcFile.replace('.', '\\.')}"><\\/script>`);
  if (!pattern.test(html)) throw new Error(`外部スクリプトが見つかりません: ${srcFile}`);
  return html.replace(pattern, () => `<script>${code}</script>`);
}

/** インライン <script> ブロックをすべて minify する */
async function minifyInlineScripts(html, name) {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  let output = html;
  for (let index = 0; index < blocks.length; index++) {
    const code = await minifyJs(blocks[index][1], `${name} script #${index + 1}`);
    output = output.replace(blocks[index][0], () => `<script>${code}</script>`);
  }
  return output;
}

async function build() {
  const liquidGlass = await minifyJs(read('src/liquid-glass.js'), 'liquid-glass.js');
  const bootstrapJs = await minifyJs(read('src/script.js'), 'script.js');
  const css = read('src/style.css');

  // 1) ブートストラップ: CSS と JS を 1ファイルにインライン化
  let indexHtml = read('src/index.html');
  indexHtml = indexHtml.replace(
    '<link rel="stylesheet" href="style.css">',
    () => `<style>${css}</style>`,
  );
  indexHtml = inlineExternalScript(indexHtml, 'liquid-glass.js', liquidGlass);
  indexHtml = inlineExternalScript(indexHtml, 'script.js', bootstrapJs);
  write('public/index.html', indexHtml);

  // 2) メインアプリ: ライブラリを結合し、インライン JS を minify して Base64 化
  let appHtml = inlineExternalScript(read('src/app.html'), 'liquid-glass.js', liquidGlass);
  appHtml = await minifyInlineScripts(appHtml, 'app.html');
  const base64 = Buffer.from(appHtml, 'utf8').toString('base64');

  mkdirSync(new URL('public/obf/', root), { recursive: true });
  write('public/obf/index', base64);
  write('public/obf/app', base64);

  console.log(
    `public/index.html: ${indexHtml.length} bytes / ` +
    `public/obf/index: ${base64.length} bytes (${appHtml.length} bytes → base64)`,
  );
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
