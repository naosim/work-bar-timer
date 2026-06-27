# Work Bar Timer
https://naosim.github.io/work-bar-timer/
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

## REST API（デスクトップ版）

デスクトップ版（Neutralinojs）起動時に `extensions/timer-api/index.js` が自動で起動し、`http://127.0.0.1:4321` で REST API を提供します。環境変数 `TIMER_API_PORT` でポートを変更可能です。

### エンドポイント

| Method | Path | 説明 |
|---|---|---|
| `GET` | `/api/status` | タイマーの全状態を取得 |
| `POST` | `/api/timer/start` | タイマー開始 |
| `POST` | `/api/timer/pause` | 一時停止 |
| `POST` | `/api/timer/reset` | リセット |
| `POST` | `/api/timer/adjust` | カウントダウン時間調整 |
| `POST` | `/api/config` | タイマー設定の変更 |
| `POST` | `/api/exec` | 任意の JavaScript コードを実行 |

### レスポンス形式

成功時は JSON レスポンスを返します。エラー時は `{ "error": "..." }` で返します。

### 使い方

```bash
# 状態取得
curl.exe http://127.0.0.1:4321/api/status

# タイマー開始
curl.exe -X POST http://127.0.0.1:4321/api/timer/start

# 一時停止
curl.exe -X POST http://127.0.0.1:4321/api/timer/pause

# リセット
curl.exe -X POST http://127.0.0.1:4321/api/timer/reset

# 時間調整（秒数を delta で指定）
curl.exe -X POST http://127.0.0.1:4321/api/timer/adjust \
  -H "Content-Type: application/json" \
  -d '{"delta": 60}'

# 設定変更
curl.exe -X POST http://127.0.0.1:4321/api/config \
  -H "Content-Type: application/json" \
  -d '{"mode":"REPEAT","repeatWorkSeconds":1500,"repeatBreakSeconds":300,"repeatCycles":4}'

# 任意 JS コード実行（return で値を返せる）
curl.exe -X POST http://127.0.0.1:4321/api/exec \
  -H "Content-Type: application/json" \
  -d '{"code":"return timer.getRemainingSeconds()"}'
```

### GET /api/status レスポンス例

```json
{
  "state": "IDLE",
  "mode": "COUNT_DOWN",
  "durationSeconds": 300,
  "elapsedSeconds": 0,
  "remainingSeconds": 300,
  "overtimeSeconds": 0,
  "repeatWorkSeconds": 1500,
  "repeatBreakSeconds": 300,
  "repeatCycles": 4,
  "currentCycle": 1,
  "currentPhase": "WORK",
  "phaseElapsedSeconds": 0,
  "totalRemainingSeconds": 0,
  "displayTime": "05:00",
  "isOvertime": false
}
```

### POST /api/exec

`code` フィールドに JavaScript コードを指定します。コードは `async function` の中で実行されるため、`await` が使用可能です。`return` 文で値を返せます。

```bash
# 現在の残り秒数を取得
curl.exe -X POST http://127.0.0.1:4321/api/exec \
  -H "Content-Type: application/json" \
  -d '{"code":"return timer.getRemainingSeconds()"}'

# タイマーを開始して状態を返す
curl.exe -X POST http://127.0.0.1:4321/api/exec \
  -H "Content-Type: application/json" \
  -d '{"code":"timer.start(); return timer.getState()"}'

# 設定を変更してから状態を取得
curl.exe -X POST http://127.0.0.1:4321/api/exec \
  -H "Content-Type: application/json" \
  -d '{"code":"timer.configure({ mode: \'COUNT_DOWN\', durationSeconds: 600 }); return timer.getConfig()"}'
```

### アーキテクチャ

REST API は Neutralinojs 拡張機能として実装されています。HTTP サーバー（Node.js）は Neutralino コアと WebSocket で双方向通信し、HTTP リクエストをタイマー操作に変換します。

```
HTTP Client ──→ extensions/timer-api/index.js (HTTP Server)
                    │
                    ├── WebSocket ──→ Neutralino Core
                    │                      │
                    │                      ├──→ WebView2 (Timer)
                    │                      │         │
                    │                      │←────────┘
                    │                      │
                    │←─────────────────────┘
                    │
HTTP Client ←──────┘
```
