# 坂家 家計フローダッシュボード — Web版 開発仕様書

> **この文書について**: Claude.ai アーティファクトとして動作している家計ダッシュボード（React単一ファイル、以下「現行版」）を、独立したWebサイトとして再実装するための仕様書。Claude Code がこの文書を読んで開発を進めることを想定している。現行版のソースコード `money-flow-dashboard.jsx` を必ず併せて参照すること（UIの構造・集計ロジック・AIプロンプトの正は現行版のコードにある）。

---

## 1. 目的と全体像

- 夫婦2人（ハルキ / アリサ）が使う家計管理Webアプリ。収入→4口座への配分→支出→投資という「お金の流れ」を大→小の階層で可視化する。
- 各自のiPhoneからURLで直接アクセスし、**Face ID（パスキー）またはPINコード**で本人認証して入る。
- ユーザーごとに固定URLを持つ: `https://<domain>/haruki`、`https://<domain>/arisa`。**ユーザー名やメールアドレスの入力は一切求めない**（URLが誰のログイン画面かを決める）。
- AI機能（レシートOCR・自然文の支出解析・家計アドバイザー・銘柄リサーチ）はサーバー側でAnthropic APIを呼んで提供する。
- スマホでの日常入力が主戦場。PWA対応でホーム画面に追加してアプリのように使えること。

### 非目標（今回はやらない）
- LINE / WhatsApp からの入力（将来フェーズ。設計上、支出追加をAPI化しておくことで後から足せるようにはする）
- 3人以上のユーザー、複数世帯対応
- ネイティブアプリ

---

## 2. 技術スタック（推奨構成）

| レイヤ | 技術 | 補足 |
|---|---|---|
| フレームワーク | Next.js（App Router） + TypeScript | API RoutesをBFFとして使う |
| UI | React + Tailwind CSS + Recharts | 現行版のダークテーマ・デザイントークンを踏襲 |
| DB | Supabase（Postgres） | 接続はサーバー側のみ（service roleキー）。クライアントから直接DBに触らせない |
| 認証 | 自前セッション（httpOnly Cookie の署名付きJWT） + @simplewebauthn/server, @simplewebauthn/browser | Supabase Authは使わない（2ユーザー固定・URLスラッグ方式のため自前が簡潔） |
| AI | Anthropic API（サーバー側から呼ぶ） | モデル: claude-sonnet-4-6。APIキーは環境変数、クライアントには絶対に渡さない |
| ホスティング | Vercel | HTTPS必須（WebAuthnの前提条件） |
| PWA | manifest.json + Service Worker（表示キャッシュのみ、データはキャッシュしない） | ホーム画面追加でスタンドアロン表示 |

### 環境変数
```
DATABASE_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
SESSION_SECRET            # JWT署名用（32byte以上のランダム値）
WEBAUTHN_RP_ID            # 例: kakeibo.example.com
WEBAUTHN_ORIGIN           # 例: https://kakeibo.example.com
```

---

## 3. 認証仕様（最重要）

### 3.1 URLとユーザーの対応
- `/{slug}` にアクセスすると、そのスラッグに対応するユーザーの**ロック画面**が表示される。slugは `profiles.slug`（例: `haruki`, `arisa`）。存在しないslugは404。
- ロック画面にはユーザー名と2つのボタンのみ: 「Face IDでロック解除」「PINで解除」。ID・メール入力欄は置かない。

### 3.2 認証手段
1. **パスキー（WebAuthn / platform authenticator）**: iPhoneのFace ID・Touch IDに対応。`authenticatorAttachment: "platform"`、`userVerification: "required"` を指定。
2. **PINコード（6桁）**: フォールバック。サーバー側でargon2（またはbcrypt）ハッシュ照合。
   - レート制限必須: 同一プロフィールで5回連続失敗→15分ロック（`profiles.failed_attempts`, `locked_until` で管理）。

### 3.3 初回セットアップの流れ
1. シードスクリプトで2ユーザー（haruki / arisa）を初期PIN付きで作成する。
2. 各自が自分のURLにアクセス→初期PINでログイン。
3. ログイン直後に「このiPhoneのFace IDを登録しますか？」のバナーを表示→WebAuthn登録フロー（register-options → ブラウザでFace ID → register-verify）。
4. 以降はFace IDワンタップで解錠。**パスキーはデバイスごとに登録が必要**（新しい端末では再度PINで入って登録する）。設定画面から登録済みデバイスの一覧・削除ができること。

### 3.4 セッション
- 認証成功でJWT（`profile_id`, `slug`, 有効期限30日）をhttpOnly / Secure / SameSite=Lax Cookieに保存。
- すべてのAPIはこのCookieを検証し、`profile_id` をリクエストコンテキストとする。URLのslugとセッションのslugが不一致ならアクセス拒否（＝ハルキのセッションで /arisa は開けない）。
- ログアウトAPIあり。加えて「30分無操作でフロント側を再ロック（画面をロック画面に戻すだけでもよい）」を実装するとなお良い。

### 3.5 セキュリティ上の注意（実装時に守ること）
- ANTHROPIC_API_KEY・service roleキーはサーバー専用。クライアントバンドルに含めない。
- PIN・認証系APIはレート制限（IP + profile単位）。
- WebAuthnのchallenge はサーバー側セッション（短命）で管理し、リプレイを防ぐ。

---

## 4. データモデル

現行版はブラウザ内の単一JSONだが、Web版は正規化する。金額は integer（円）。

```sql
profiles (
  id uuid pk, slug text unique, name text,
  pin_hash text, failed_attempts int default 0, locked_until timestamptz,
  created_at timestamptz default now()
)

webauthn_credentials (
  id uuid pk, profile_id uuid fk, credential_id text unique,
  public_key text, counter bigint, device_name text, created_at timestamptz
)

accounts (            -- 4口座。行は固定4件（a1..a4）
  id text pk,         -- 'a1'|'a2'|'a3'|'a4'
  name text, color text, budget int, sort int
)
-- 初期値: a1 第1口座（生活費）#F5A524 180000 / a2 第2口座（ローン等）#63C7E8 0
--         a3 第3口座（趣味・娯楽・交際）#2FB8A6 60000 / a4 第4口座（投資）#8B7CF6 80000
-- a3 がプライベート口座（定数 PRIVATE_ACCOUNT = 'a3'）

expenses (
  id uuid pk, owner uuid fk profiles, date date not null,
  account_id text fk accounts, category text, sub text,   -- sub: 「その他」の内容
  amount int not null, memo text, created_at timestamptz
)

incomes (             -- 月ごとに可変。誰でも編集可
  id uuid pk, month text not null,   -- 'YYYY-MM'
  name text, amount int, owner uuid null
)

investments (
  id uuid pk, owner uuid fk, date date, name text, amount int, memo text
)

custom_categories ( name text pk, created_at timestamptz )   -- 「その他」から昇格したカテゴリ
other_counts ( name text pk, count int )                      -- その他の内容→入力回数
```

固定カテゴリ（コード内定数）: 食費, 外食, 住居, 水道光熱, 通信, 交通, 日用品, 趣味, ペット, 医療, 交際費, 旅行, 投資, その他。
使用可能カテゴリ = 固定（その他を除く） + custom_categories + 「その他」（末尾）。

---

## 5. プライバシー仕様（第3口座）— サーバー側で強制すること

現行版はクライアント表示で隠しているだけだが、Web版では**APIレスポンスの時点でデータを渡さない**こと。これが移行の主要な改善点。

| データ | 自分の入力 | 相手の入力（第3口座 a3） |
|---|---|---|
| 明細の存在 + カテゴリ | 見える | 見える |
| 日付・金額・メモ・sub | 見える | **APIが返さない**（`masked: true` フラグのみ） |
| 口座の月合計（a3含む） | 含む | 含む（合計だけは共有、が仕様） |
| カテゴリ別集計・日別集計・支出トップ | 含む | **金額を含めない**（サーバー集計時に除外） |
| 削除・編集 | 可 | 不可（自他問わず自分の行のみ編集・削除可） |
| AIアドバイザーへのコンテキスト | 含む | **含めない**（サーバーでコンテキスト構築時に除外） |

マスク済み行のレスポンス例: `{ id, account_id: "a3", category: "趣味", owner_name: "アリサ", masked: true }`（date/amount/memo/sub キー自体を含めない）。

---

## 6. API設計（Next.js Route Handlers）

認証系:
```
POST /api/auth/pin                      { slug, pin } → セッションCookie
POST /api/auth/webauthn/register-options    （要ログイン）
POST /api/auth/webauthn/register-verify
POST /api/auth/webauthn/login-options   { slug }
POST /api/auth/webauthn/login-verify    → セッションCookie
POST /api/auth/logout
GET  /api/auth/me                       → { profile, 登録済みデバイス }
DELETE /api/auth/webauthn/:credentialId
```

データ系（すべて要セッション。§5のマスク・除外をサーバーで適用）:
```
GET  /api/month?m=YYYY-MM
  → { incomes[], expenses[](マスク適用済), investments[],
      aggregates: {
        perAccount: [{id, spent, spentMine}],     -- spentは相手a3も含む真の合計
        monthTotals: {income, expense, invest},   -- 真の合計
        perCategory: [{name, value}],             -- 相手a3除外
        perDay: {"YYYY-MM-DD": value},            -- 相手a3除外（カレンダー用）
      } }
POST   /api/expenses          { entries: [...] } → 一括追加。§7のルール適用。{ promoted: string[] } を返す
DELETE /api/expenses/:id      （自分の行のみ）
POST / DELETE /api/investments
GET / PUT /api/incomes?m=     （両者編集可）
PUT  /api/accounts            （名前・予算。両者編集可）
GET  /api/trend               → 直近12ヶ月の月別 収入/支出/投資
GET  /api/export/analysis     → 分析用データ出力（§12。期間・対象指定、JSON/CSV）
GET  /api/settings  /  PUT（PIN変更は現PIN必須） / DELETE /api/custom-categories/:name
```

AI系（サーバーでAnthropic APIを呼ぶプロキシ。プロンプトは§8）:
```
POST /api/ai/ocr          multipart画像 → { date, store, total, category }
POST /api/ai/parse-text   { text } → [{ date, account, category, amount, memo }]
POST /api/ai/advisor      { messages[] } → { reply }   -- コンテキストはサーバーがDBから構築（§5適用）
POST /api/ai/research     { query } → { text }          -- web_searchツール有効で呼ぶ
```
AI系は乱用防止のためユーザー単位でレート制限（例: 60回/時）を入れる。

---

## 7. 支出追加の共通ルール（現行版 `addEntries` と同一挙動）

1. **日付が空・未指定なら当日の日付**（JST）で登録する。
2. カテゴリが「その他」で `sub`（内容）がある場合、`other_counts[sub]` をインクリメント。
3. カウントが**3回に達したら** `custom_categories` に昇格し、**過去の全ての「その他 + 同一sub」の支出を新カテゴリに付け替える**（トランザクション内で実施）。レスポンスの `promoted` に昇格したカテゴリ名を入れ、フロントは「✨『サウナ』を新カテゴリにしました」と表示。
4. `owner` は常にセッションの profile_id（クライアントから指定させない）。

---

## 8. AI仕様（プロンプトは現行版から移植）

サーバー側で `claude-sonnet-4-6` を呼ぶ。JSONを求めるプロンプトはすべて「JSONのみ・前置きとコードブロック不要」を明示し、パース前に ``` フェンスを除去する。カテゴリ候補・口座候補は**その時点のDBの値を動的に埋め込む**こと。

1. **レシートOCR**: 画像 + 「このレシート画像を読み取り、次のJSONのみを返してください…`{"date","store","total","category"}`」。categoryは使用可能カテゴリのいずれか。
2. **自然文解析**: 「次の日本語の文章から家計簿の支出エントリを抽出し、JSON配列のみを…」。今日の日付を渡し相対表現（昨日等）を解決させる。**口座推定ルールを含める**: 生活必需品→a1、ローン返済→a2、趣味・娯楽・交際・レジャー→a3、投資関連→a4、不明→a1。複数支出は複数要素。
3. **家計アドバイザー**: system にサーバーが構築したコンテキスト（当月収支・判定・口座別・カテゴリ別・推移・明細※相手a3除外・投資・累計）+ 制約（日本語・簡潔300字目安・売買推奨禁止・データにないことは推測と明示・相手の第3口座は「非公開のため分かりません」と回答）。会話履歴はクライアントが保持して毎回送る。
4. **銘柄リサーチ**: web_searchツールを有効化し、「概要・直近動向・代表的な投資手段・リスク。売買推奨はしない」でまとめさせる。

正確な文言は現行版コード内の `ocrReceipt` / `parseExpenseText` / `buildAgentContext` / `runResearch` を参照して移植すること。

---

## 9. 画面仕様（現行版のUI・機能を完全移植）

ルーティング: `/{slug}`（ロック画面）→ 認証後 `/{slug}/app`（SPA的に切替）。左上「☰」ホバー/タップでサイドペインを開き、以下を切替表示する。

1. **① サマリー**: 収入/支出/投資/収支の4カード（前月比サブ表示）、総合判定バッジ（貯蓄率: 25%↑優秀 / 10%↑良好 / 0%↑注意 / 赤字は使いすぎ）、支出トップカテゴリバー、直近12ヶ月推移チャート。
2. **② お金の流れ**: 収入→4口座のリボン図（SVG）、配分詳細テーブル（予算/使用/残り/消化率/判定）、**日別カレンダー**（ヒートマップ、日タップで明細展開、短縮表記「1.2万」、相手a3の金額除外と注記）。
3. **③ 口座・判定**: 口座カード×4（消化バー + 判定: 80%↓余裕あり / 100%↓順調 / 115%↓注意 / 超は使いすぎ）、口座ドリルダウン（カテゴリ別バー + 明細）。
4. **④ 支出明細**: 文章入力欄 + フォーム（日付/口座/カテゴリ/金額/メモ、その他選択時はsub入力欄と「3回で新カテゴリ」ヒント、「日付を空にすると今日で登録」ヒント）、レシートOCRボタン、カテゴリ別円グラフ、口座フィルタチップ付き明細リスト（マスク行は 🔒非公開 / ¥•••••、相手の行は削除不可）。
5. **⑤ 投資**: 今月/累計カード、月別投資推移、記録フォーム、投資先円グラフ+一覧（入力者チップ）、銘柄リサーチ（テキスト入力→AI回答、免責文言）。
6. **⑥ シミュレーション**: 月収/月支出/投資割合/想定年利/期間/現在資産を入力→月次複利で現金・投資・合計の推移チャート + 楽観(+2%)/悲観(-2%)の点線シナリオ。
7. **⑦ 設定**: 今月の収入編集（追加/削除可・毎月調整可能）、口座名・予算編集、自動追加カテゴリの管理（削除しても過去記録は残る）、**PIN変更・パスキー（デバイス）管理**、データエクスポート（JSONダウンロード）。
8. **⚡ クイック入力**（`/{slug}/quick` 直リンク可・PWAのショートカット対象）: 「⌨️手入力 / ✍️文章 / 📷レシート」の3タブ。手入力は 1金額→2口座（残り予算表示）→3カテゴリ のステップUI、メモ・日付は折りたたみ（任意）。文章は複数件即追加/1件は確認フロー。レシートはカメラ直起動（`capture="environment"`）。
9. **✦ AIアドバイザー**: 右下FAB→ポップアップチャット。初回サジェスト3問、履歴クリア、ビュー間で履歴保持。

デザイン: ダークテーマ（bg #101418 / surface #181E25 / アクセント #F5A524）、見出し Zen Old Mincho、本文 IBM Plex Sans JP、数字 IBM Plex Mono（tabular-nums）。現行版のCSSを移植してよい。ヘッダーに月切替（‹ ›）。プロフィールタブは廃止し、代わりにヘッダーに自分の名前と相手のオンライン不要表示（名前のみ）を出す。**ユーザー切替UIは置かない**（URL+認証で分離されるため）。

---

## 10. データ移行

現行版のエクスポートJSON（アーティファクトの window.storage キー `money-flow-dashboard-v1`）を取り込む `scripts/import.ts` を作る。

```
入力形状: {
  accounts: [{id,name,color,budget}],
  months: { "YYYY-MM": { incomes:[{id,name,amount}], expenses:[{id,date,account,category,sub?,amount,memo,owner}], investments:[{id,date,name,amount,memo,owner}] } },
  profiles: [{id:"p1"|"p2", name, pin}], customCategories: string[], otherCounts: {[k]:number}
}
マッピング: p1→haruki, p2→arisa。owner未設定の行は haruki 帰属。
月ネストは expenses/investments の date、incomes の month カラムに展開。
```

---

## 11. 開発フェーズと受け入れ基準

**Phase 1 — 基盤**: DBスキーマ+シード、PIN認証、セッション、`/haruki` `/arisa` ロック画面。✅ 各URLからPINで入れ、他人のslugにはセッション不一致で入れない。
**Phase 2 — パスキー**: WebAuthn登録・ログイン・デバイス管理。✅ iPhone実機のFace IDで解錠できる。
**Phase 3 — データCRUD + プライバシー**: /api/month ほか全データAPI。✅ アリサのa3明細がハルキのセッションのAPIレスポンスに金額・メモ・日付を**一切含まない**ことをテストで担保（自動テスト必須）。
**Phase 4 — 画面移植**: §9の全ビュー。✅ 現行版と同じ操作・同じ集計値になる。
**Phase 5 — AI**: 4つのAIエンドポイント + レート制限。✅ OCR/文章/アドバイザー/リサーチが動く。キーがクライアントに漏れていない。
**Phase 6 — PWA + 移行 + 分析出力**: manifest、ホーム画面追加、インポートスクリプト、エクスポート機能、§12の分析用データ出力。✅ ホーム画面から起動→Face ID→クイック入力まで3タップ以内。分析出力を期間指定で取得し、そのままClaudeに貼って分析回答が得られる。

## 12. 分析用データ出力（AI分析のための機械可読エクスポート）

**目的**: お金の使い方の深掘り分析をClaude（このアプリ内のアドバイザーに限らず、外部のClaudeも含む）に任せられるよう、**指定した期間・対象の数値全体をワンアクションで出力**できるようにする。人間の可読性より、LLMが誤解なく解析できる自己記述的な構造を優先する。

### 13.1 API

```
GET /api/export/analysis
  ?from=YYYY-MM-DD&to=YYYY-MM-DD     # 期間（必須。プリセット: 今月/先月/直近3ヶ月/半年/1年/全期間）
  &types=expenses,incomes,investments # 対象データ種別（省略時は全部）
  &accounts=a1,a3                     # 口座で絞り込み（省略時は全口座）
  &categories=食費,外食               # カテゴリで絞り込み（省略時は全カテゴリ）
  &owner=me|all                       # 自分のみ / 世帯全体（デフォルト all）
  &format=json|csv                    # デフォルト json
  &granularity=raw|daily|monthly      # raw=明細込み / daily・monthly=集計のみ（デフォルト raw）
```

### 13.2 JSON出力形式

先頭に `meta`（スキーマの自己記述）を必ず含める。LLMに前提説明なしで渡せるようにするため。

```jsonc
{
  "meta": {
    "generated_at": "...", "period": {"from": "...", "to": "..."},
    "filters": { ... リクエストで指定した絞り込み ... },
    "requester": "haruki",
    "currency": "JPY",
    "accounts": [{"id":"a1","name":"第1口座（生活費）","budget_monthly":180000}, ...],
    "privacy_note": "第3口座(a3)の相手の明細は amount/date/memo を含まない(masked:true)。集計値のうち total_all のみ相手分を含む。",
    "schema_note": "amounts are integers in JPY. dates are ISO-8601."
  },
  "summary": {
    "months_covered": 3,
    "income_total": 0, "expense_total_all": 0, "expense_total_visible": 0,
    "invest_total": 0, "savings_rate": 0.23
  },
  "monthly": [ {"month":"2026-05","income":..,"expense_all":..,"invest":..,
                "by_account":{"a1":..},"by_category_visible":{"食費":..}} ],
  "daily":   [ {"date":"2026-05-01","expense_visible":..} ],
  "by_category": [ {"category":"食費","total":..,"count":..,"avg":..,"share":0.31} ],
  "by_account":  [ {"account":"a1","total_all":..,"budget":..,"utilization":1.04} ],
  "by_weekday":  { "0":.., "6":.. },
  "expenses":    [ {"date":"...","account":"a1","category":"食費","amount":480,"memo":"コンビニ","owner":"haruki"},
                   {"account":"a3","category":"趣味","owner":"arisa","masked":true} ],
  "incomes":     [ {"month":"2026-05","name":"給与","amount":..} ],
  "investments": [ {"date":"...","name":"...","amount":..,"owner":".."} ]
}
```

- **プライバシー（§5準拠）**: リクエスト者から見た相手のa3明細は `masked:true` でカテゴリ・口座・ownerのみ。`by_category` / `daily` / `by_weekday` は相手a3金額を除外し、`by_account.total_all` と `summary.expense_total_all` のみ相手分込みの真値。`expense_total_visible` との差額が非公開分。
- CSV形式は expenses のフラットテーブルのみ（集計はJSONのみ）。マスク行は amount 空欄 + masked=1 列。
- サイズ上限: 明細が5,000行を超える場合は `granularity=daily` に自動フォールバックし、metaに `truncated:true` と理由を記載。

### 13.3 UI（⑦設定内 or サイドペインに「📊 分析出力」項目）

1. 期間プリセットボタン（今月/先月/3ヶ月/半年/1年/全期間）+ カスタム日付範囲。
2. 対象の絞り込み（口座・カテゴリ・自分のみ/世帯全体・粒度）。
3. アクション3つ:
   - **📋 Claude用にコピー**: 分析依頼プロンプト（下記テンプレート）+ JSONをまとめてクリップボードへ。ユーザーはClaudeに貼るだけ。
   - **⬇ JSONダウンロード** / **⬇ CSVダウンロード**。
   - **✦ このデータでアドバイザーに聞く**: 生成したJSONをアプリ内AIアドバイザーのコンテキストに差し込んでチャットを開く（通常のアドバイザーは当月コンテキストだが、これで任意期間の分析ができる）。
4. プロンプトテンプレート（コピー時に先頭へ付与）:
   「以下は家計アプリからエクスポートした支出データ（JSON、meta参照）。このデータに基づいて、支出パターンの分析・無駄の指摘・改善提案をしてください。データにない事柄は推測と明示してください。」

### 13.4 受け入れ基準

- 期間・口座・カテゴリ・owner・粒度の全組み合わせで正しい集計が返る（`summary` の値がダッシュボード表示と一致する自動テスト）。
- ハルキのセッションで取得した出力に、アリサのa3の amount/date/memo/sub が**どの粒度でも**含まれない（自動テスト必須）。
- 「Claude用にコピー」→ 外部のClaudeに貼付 → 前提質問なしで分析回答が返ることを実機確認。


## 13. 運用メモ

- ドメインは任意（例の kakeibo.com は取得可否未確認。取得したドメインを WEBAUTHN_RP_ID に設定）。
- 想定コスト: Vercel Hobby + Supabase Free で¥0、Anthropic API利用分のみ従量（家庭利用なら月数十〜数百円規模）。
- URLは推測可能なので、認証（パスキー/PIN+レート制限）が唯一の防壁である前提で実装すること。心配ならslugを `haruki-x7k2` のようにランダム接尾辞付きにしてもよい（profiles.slugを変えるだけ）。
