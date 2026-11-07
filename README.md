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

- 取得先: GitHub Raw / jsDelivr / Statically / esm.sh / raw.githack.com / githubraw.com
- Auto（デフォルト）は GitHub Raw を優先し、失敗時に他の取得先へ順番にフォールバック
- 設定から単一の取得先を指定することも可能
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

本番ビルドでは Terser による JavaScript の minify と、軽度の難読化、CSS のインライン化を行います。

- Terser による minify（コメント削除・圧縮・識別子短縮）
- javascript-obfuscator による軽度な難読化
  - 文字列の一部を Base64 配列に退避
  - 識別子を 16 進数名に置換（グローバル名は維持）
  - 制御フロー変換・デッドコード挿入・自己防御は無効（軽量・安全重視）
  - `seed` 固定で再現性のあるビルド
- Bootstrap の CSS を HTML にインライン化（JS は minify + 難読化してインライン化）
- Liquid Glass は独立した `public/liquid-glass.js` として minify + 難読化
- メインアプリケーションのインライン JS を minify + 難読化
- Base64 形式でアプリケーションを出力
- `public/` 以下に配布用ファイルを生成

---

<i>Made with ❤️ by [@zenith-kamo](https://github.com/zenith-kamo)</i>