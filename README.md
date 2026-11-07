# Sumi

— One launcher. Free access. Unblock.

---
Sumi は、Shadow / Doge UB / Opium の3つのサービスへシームレスにアクセスするための、モダンなダークテーマのランチャーです。

洗練された UI、動的な URL 解決、軽量なブートストラップ構造を採用。URL リストから利用可能なエンドポイントを自動検出し、最適な接続先を選択してサービスを起動します。

## ✦ Project Structure

ソースコードと配布ファイルを明確に分離した構成です。

```text
src/                        # Development source
├── index.html              # Bootstrap entry point
├── script.js               # Bootstrap logic
├── style.css               # Bootstrap styles
├── liquid-glass.js         # Liquid Glass UI library
└── app.html                # Main application

public/                     # Production build
├── index.html              # Optimized bootstrap
├── liquid-glass.js         # Minified UI library (independent)
├── favicon.ico
├── favicon.png
├── img/                    # Service icons
└── obf/
    ├── index               # Base64 encoded application
    └── app                 # Base64 encoded application

link/                       # URL lists served from GitHub Raw / jsDelivr
├── shadow.txt
├── doge.txt
└── opium.txt

build.mjs                   # Build script
package.json                # Development dependencies
```

## ✦ Core Features

### Dynamic URL Resolution

複数のリソースからURL リストを取得します。

- 各 URL を iframe で順次検証
- 最初に正常に利用できた URL を自動選択

### about:blank Cloaking

about:blank を利用したクローキング機能を搭載しています。これにより、履歴に残るURLがabout:blankになります。

- 設定は LocalStorage に永続化
- 起動時のローディング開始段階で有効状態を判定
- 有効時は新しい about:blank タブへ自動的に切り替え


### Persistent Settings

ユーザー設定は LocalStorage に保存され、ブラウザを閉じた後も維持されます。

## ✦ Development

開発環境のセットアップとビルドはシンプルです。

```bash
# Install dependencies
npm install

# Build for production
npm run build
```

または直接実行：

```bash
node build.mjs
```

`src/` 内のソースを編集し、ビルドを実行するだけで `public/` 以下の配布ファイルが自動生成されます。

## ✦ Build Pipeline

本番ビルドでは Terser による JavaScript の minify と、CSS のインライン化を行います。

- Bootstrap の CSS を HTML にインライン化（JS は minify してインライン化）
- Liquid Glass は独立した `public/liquid-glass.js` として minify 出力
- メインアプリケーションのインライン JS を minify
- Base64 形式でアプリケーションを出力
- `public/` 以下に配布用ファイルを生成

---

<i><center>Made with ❤️ by [@zenith-kamo](https://github/zenith-kamo)</center></i>