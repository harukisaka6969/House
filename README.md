# 坂家 家計フローダッシュボード — Web版

夫婦2人（ハルキ / アリサ）向けの家計管理Webアプリ。仕様は `kakeibowebspec.md`（開発時に参照した設計書）を参照。Next.js（App Router）+ Supabase(Postgres) + WebAuthn + Anthropic API で構成。

## セットアップ

### 1. 依存関係

```bash
npm install
```

### 2. Supabaseプロジェクトを用意

新しいSupabaseプロジェクトを作成し、`supabase/migrations/` 内のSQLを順番に適用する（Supabase SQL Editorに貼り付けて実行、または `supabase db push` などお好きな方法で）。

- `0001_init.sql` — スキーマ全体（profiles, webauthn_credentials, accounts, expenses, incomes, investments, custom_categories, other_counts）と初期4口座の投入
- `0002_add_expense_entries.sql` — 支出の一括追加＋「その他」カテゴリ自動昇格をトランザクション内で行うDB関数

### 3. 環境変数

`.env.example` を `.env` にコピーして値を埋める。

```bash
cp .env.example .env
```

| 変数 | 説明 |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | サーバー専用。クライアントには渡さない |
| `DATABASE_URL` | `scripts/seed.ts` / `scripts/import.ts` では未使用（Supabase JSクライアント経由のため）だが将来の直接接続用に確保 |
| `ANTHROPIC_API_KEY` | サーバー側のみ。レシートOCR・文章解析・アドバイザー・銘柄リサーチで使用 |
| `SESSION_SECRET` | セッションJWT署名用。`openssl rand -base64 32` などで32byte以上のランダム値を生成 |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | パスキー用。本番ドメインに合わせる（例: `kakeibo.example.com` / `https://kakeibo.example.com`）。ローカル開発は `localhost` / `http://localhost:3000` |

### 4. 初期ユーザーを作成

```bash
SEED_HARUKI_PIN=123456 SEED_ARISA_PIN=654321 npm run seed
```

`/haruki` `/arisa` にPINでログインできるようになる。ログイン後、設定画面からパスキー（Face ID / Touch ID）を登録し、PINも変更しておくこと。

### 5. 開発サーバー

```bash
npm run dev
```

`http://localhost:3000/haruki` または `/arisa` にアクセス。

## テスト

```bash
npm test
```

`tests/aggregate.test.ts` と `tests/analysisExport.test.ts` に、§5のプライバシーマスキング（相手の第3口座の明細を金額・日付・メモ・sub抜きで返すこと）と §12 分析出力の同等の保証を検証する自動テストがある。

## 現行版データの移行

現行版（Reactアーティファクト）のエクスポートJSON（`window.storage` の `money-flow-dashboard-v1`/`v2` キー相当）を取り込む場合:

```bash
npm run import -- path/to/export.json
```

`scripts/seed.ts` を先に実行し、`/haruki` `/arisa` の profiles 行を作成しておくこと。

## デプロイ

Vercelを想定。環境変数を設定し、`WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` を本番ドメインに合わせること（WebAuthnはHTTPS必須）。

## 実装済みの範囲

- Phase 1: DBスキーマ・シード・PIN認証・セッション・ロック画面
- Phase 2: WebAuthn（パスキー）登録・ログイン・デバイス管理
- Phase 3: 全データAPI + §5準拠のプライバシーマスキング（自動テストあり）
- Phase 4: §9の全ビュー（サマリー／お金の流れ／口座・判定／支出明細／投資／シミュレーション／設定）+ AIアドバイザー
- Phase 5: レシートOCR・自然文解析・アドバイザー・銘柄リサーチの4 AIエンドポイント（レート制限つき）
- Phase 6: PWA（マニフェスト・アイコン・表示キャッシュのみのService Worker）、データ移行スクリプト、§12分析出力（JSON/CSV、Claude用コピー、アドバイザー連携）
