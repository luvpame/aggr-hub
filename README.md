# 📰 Aggr Hub

> 🔗 RSS / Atom / GitHub Releases をまとめて管理するフィードアグリゲーター

複数の情報ソースを一箇所に集約し、効率的に情報収集できるセルフホスト型のフィードリーダーです。

---

## ✨ Features

- 📡 **フィード自動検出** — URLからRSS/Atom/GitHub Releasesフィードを自動判別
- 🤖 **AI要約** — OpenAI APIを使ったエントリの自動要約
- 🔄 **定期フェッチ** — cronによる15分間隔の自動更新
- 📱 **レスポンシブUI** — モバイル対応のモダンなインターフェース
- 📜 **無限スクロール** — カーソルベースのページネーション
- ⭐ **お気に入り** — 気になるエントリをブックマーク
- ✅ **既読管理** — 一括既読/未読の切り替え
- 🏷️ **日付グルーピング** — Today / Yesterday / 日付ごとにエントリを整理
- 🖼️ **OGP画像表示** — エントリのサムネイルを自動取得
- 📂 **折りたたみサイドバー** — デスクトップ向けのコンパクト表示

---

## 🏗️ Tech Stack

### 🖥️ Frontend (`apps/web`)

| Category         | Technology           |
| ---------------- | -------------------- |
| ⚛️ Framework     | React 19             |
| 🎨 Styling       | Tailwind CSS 4       |
| 🧭 Routing       | React Router 7       |
| 📦 Data Fetching | TanStack React Query |
| 🔤 Icons         | Lucide React         |
| 📝 Markdown      | react-markdown       |

### ⚙️ Backend (`apps/server`)

| Category       | Technology  |
| -------------- | ----------- |
| 🔥 Framework   | Hono 4      |
| 🗄️ Database    | SQLite      |
| 🛢️ ORM         | Drizzle ORM |
| 📡 Feed Parser | rss-parser  |
| ⏰ Scheduler   | node-cron   |
| 🤖 AI          | OpenAI SDK  |
| 📦 Build       | tsdown      |

### 🐳 Infrastructure

| Category           | Technology     |
| ------------------ | -------------- |
| 📦 Container       | Docker Compose |
| 🌐 Web Server      | nginx          |
| 📋 Package Manager | pnpm           |
| ⚡ Toolchain       | Vite+          |

---

## 📁 Project Structure

```
aggr-hub/
├── 📂 apps/
│   ├── 🖥️ web/          # React フロントエンド
│   └── ⚙️ server/       # Hono バックエンド API
├── 🐳 compose.yml        # Docker Compose 設定
├── 🌐 nginx/             # nginx 設定
└── 📋 pnpm-workspace.yaml
```

---

## 🚀 Getting Started

### 🐳 Docker（推奨）

```bash
docker compose up -d
```

`http://localhost` でアクセスできます。

### 💻 ローカル開発

**前提条件:**

- 📦 Node.js 24+
- ⚡ [Vite+](https://vite.dev/plus/) (`vp` CLI)

```bash
# 依存関係のインストール
vp install

# SQLite DBを作成
vp run server#db:migrate

# 開発サーバーを起動
vp run dev:up
```

| App         | URL                     |
| ----------- | ----------------------- |
| 🖥️ Frontend | `http://localhost:5173` |
| ⚙️ Backend  | `http://localhost:3000` |

---

## 📝 API Endpoints

Base: `/api/v1`

### 📡 Feeds

| Method   | Endpoint             | Description         |
| -------- | -------------------- | ------------------- |
| `GET`    | `/feeds`             | 📋 フィード一覧取得 |
| `POST`   | `/feeds`             | ➕ フィード追加     |
| `GET`    | `/feeds/:id`         | 🔍 フィード詳細取得 |
| `PATCH`  | `/feeds/:id`         | ✏️ フィード更新     |
| `DELETE` | `/feeds/:id`         | 🗑️ フィード削除     |
| `POST`   | `/feeds/:id/refresh` | 🔄 フィード手動更新 |

### 📰 Entries

| Method  | Endpoint                 | Description         |
| ------- | ------------------------ | ------------------- |
| `GET`   | `/entries`               | 📋 エントリ一覧取得 |
| `GET`   | `/entries/:id`           | 🔍 エントリ詳細取得 |
| `PATCH` | `/entries/:id`           | ✏️ エントリ更新     |
| `POST`  | `/entries/mark-read`     | ✅ 一括既読         |
| `POST`  | `/entries/mark-unread`   | 📬 一括未読         |
| `POST`  | `/entries/mark-all-read` | ✅ 全件既読         |

---

## 🛠️ Development

```bash
# ✅ 準備状況チェック
vp run ready

# 🧪 テスト実行
vp run test -r

# 🏗️ ビルド
vp run build -r

# 🔍 リント・型チェック
vp check
```

### PostgreSQL から SQLite への移行

既存の PostgreSQL データを引き継ぐ場合は、SQLite の migration を適用してから一回だけ import を実行します。

```bash
vp run server#db:migrate
DATABASE_URL=postgres://aggrhub:aggrhub@localhost:5432/aggrhub SQLITE_DB_PATH=./aggr-hub.sqlite vp run server#db:migrate:from-postgres
```

通常起動時は PostgreSQL は不要です。SQLite ファイルの場所は `SQLITE_DB_PATH` で変更できます。

---

## 📄 License

MIT
