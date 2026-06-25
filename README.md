# Work Bar Timer

キングジム「ビジュアルバータイマー VBT20」を模した、20セグメントの視覚的なバーで残り時間を表示するクロスプラットフォームタイマーアプリ。

## 機能

- **カウントダウン** — 20セグメントのバーが残り時間に応じて減少（緑→黄→橙→赤の4色グラデーション）
- **カウントアップ** — ストップウォッチ（10分ごとに1セグメント点灯）
- **ポモドーロ** — 作業/休憩を繰り返すリピート計測
- マウスホイール / +/-ボタンで時間調整
- キーボードショートカット（Space: 開始/停止, Esc: リセット）

## ディレクトリ構成

```
├── src/
│   ├── Timer.ts             # ドメインロジック（純粋TypeScript、プラットフォーム非依存）
│   ├── Timer.test.ts        # ユニットテスト
│   ├── main.ts              # UIバインド、イベント処理、プラットフォーム統合
│   ├── style.css            # 全スタイル（ダークテーマ）
│   └── neutralino.d.ts      # Neutralino グローバル型定義
├── index.html               # HTMLシェル
├── neutralino.config.json    # Neutralinojs デスクトップ設定
├── tsconfig.json
├── vite.config.ts
└── package.json
```

## コマンド

### 開発サーバー（ブラウザ）

```bash
npm run dev
```

Vite 開発サーバーが http://localhost:3000 で起動します。

### テスト

```bash
npm run test
```

Vitest によるユニットテストを実行します。

### ビルド（ブラウザ用）

```bash
npm run build
```

TypeScript の型チェック + Vite ビルドを行い、`dist/` に出力します。

### ビルド → GitHub Pages デプロイ

`main` ブランチにプッシュすると、GitHub Actions が自動でテスト・ビルド・GitHub Pages へのデプロイを実行します。

### デスクトップ版のプレビュー

```bash
npm run build   # → dist/ にリソース生成
neu run         # Neutralino デスクトップウィンドウで起動
```

### デスクトップ版のバイナリ生成

```bash
npm run build   # → dist/ にリソース生成
neu build       # → dist-WorkBarTimer/ に各プラットフォームのバイナリを出力
```

出力例:
- `dist-WorkBarTimer/WorkBarTimer-win_x64.exe` (Windows)
- `dist-WorkBarTimer/WorkBarTimer-linux_x64` (Linux)
- `dist-WorkBarTimer/WorkBarTimer-mac_x64` (macOS)

### 前提条件

- Node.js 20+
- npm
- Neutralino CLI（`npm install -g @neutralinojs/neu`）

## 技術スタック

| 層 | 技術 |
|---|---|
| 言語 | TypeScript (strict) |
| ビルド | Vite 5 |
| テスト | Vitest |
| デスクトップランタイム | Neutralinojs |
| UI | HTML5 / CSS3（カスタム、フレームワークなし） |
| 音声 | Web Audio API（ファイル不要のシンセサイズ音） |
| CI/CD | GitHub Actions → GitHub Pages |
