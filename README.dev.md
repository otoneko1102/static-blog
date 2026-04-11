# テンプレートとして使う方へ

このリポジトリをフォークまたはクローンして自分のブログとして使うための手順です。

---

## 0. 前提

- **Node.js** ≥ 22.12.0
- **npm**
- GitHub Pages でのデプロイを想定（`.github/workflows/deploy.yml` 同梱）

```bash
npm install
npm run dev     # ローカル開発サーバー
npm run build   # 静的ビルド（dist/）
npm run preview # ビルド結果のプレビュー
```

---

## 1. 必ず変更するもの

### `src/consts.ts` — サイト全体の定数

ここを変えるだけでヘッダー、フッター、OGP、RSS など多くの箇所に反映されます。

| 定数 | 説明 |
|---|---|
| `SITE_TITLE` | サイト名 |
| `SITE_DESCRIPTION` | サイトの説明文 |
| `SITE_URL` | 公開URL（末尾スラッシュなし） |
| `TWITTER_HANDLE` | X（Twitter）のハンドル |
| `GITHUB_URL` | GitHub プロフィール URL |
| `PORTFOLIO_URL` | ポートフォリオ URL |
| `AUTHOR_NAME` | 著者名（meta タグ、フッター、プロフィール等） |
| `AUTHOR_BIO` | 自己紹介文（サイドバー、About ページ） |

`astro.config.mjs` の `site` は `SITE_URL` を自動参照しているため個別の変更は不要です。

### `public/CNAME`

GitHub Pages でカスタムドメインを使う場合はドメインを書き換え、使わない場合はファイルを削除してください。

---

## 2. 画像の差し替え

| ファイル | 用途 | 推奨サイズ |
|---|---|---|
| `public/icon.png` | ファビコン・ヘッダーロゴ・プロフィールアイコン | 正方形 |
| `public/header.png` | ヘッダーバナー画像 | 横長（自由） |
| `public/thumbnail.png` | OGP 画像の背景 | 1200×630 |

---

## 3. その他の個別設定

| 箇所 | ファイル |
|---|---|
| `.env.example` の `SITE` | `SITE_URL` と同じ値に変更 |
| About ページの本文 | `src/pages/about.astro` |

---

## 4. テーマカラー（任意）

`src/styles/global.css` の CSS カスタムプロパティを編集します。

```css
/* ライトテーマ */
:root {
  --accent: #6c5ce7;        /* メインのアクセントカラー */
  --accent-hover: #5b4cdb;
}

/* ダークテーマ */
[data-theme="dark"] {
  --accent: #a78bfa;
  --accent-hover: #c4b5fd;
}
```

コードブロックのシンタックスハイライトテーマは `astro.config.mjs` の `shikiConfig.themes` で変更できます。

---

## 5. 記事の書き方

### 新しい記事を作成

```bash
npm run new
```

対話形式で記事 ID・タイトル・タグなどを入力すると、`src/content/blog/<id>.mdx` と `public/files/<id>/` が自動生成されます。

### フロントマターの項目

```yaml
---
title: "記事タイトル"
description: "記事の説明"
pubDate: "2026-04-11"          # YYYY-MM-DD（JST）
updatedDate: null               # 更新日（任意）
tags: ["タグ1", "タグ2"]
pinned: false                   # トップ固定
hidden: false                   # 一覧から非表示
---
```

### 画像の配置

記事に使う画像は `public/files/<記事ID>/` に置き、MDX 内では以下のように参照します:

```md
![alt](/files/<記事ID>/image.png)
```

---

## 6. デプロイ

同梱の `.github/workflows/deploy.yml` が `main` ブランチへの push 時に自動ビルド＆GitHub Pages デプロイを行います。

1. リポジトリの **Settings → Pages → Source** を **GitHub Actions** に設定
2. カスタムドメインを使う場合は `public/CNAME` と DNS 設定を済ませる
3. `main` に push すれば自動デプロイ

---

## 7. 既存のサンプル記事を削除する

フォーク後、以下を削除すればまっさらな状態になります:

- `src/content/blog/` 内の `.mdx` ファイルをすべて削除
- `public/files/` 内のフォルダをすべて削除
