# ChatGPT Conversation Pruner 🧹

This Chrome Extension (Manifest V3) addresses the issue where the conversation list retrieved upon opening a session with a high number of exchanges on ChatGPT Web (`chatgpt.com`) (`/backend-api/conversation/{conversation-id}`) becomes enormous and slows down loading. It does this by **compressing the retrieved response (JSON) to lighten the initial page load**.

---

## What It Does ✅

- Hooks only the **GET** request for `https://chatgpt.com/backend-api/conversation/{conversation-id}`
- Compresses the returned JSON, retaining only the **last N exchanges + the first 1 exchange**
- Passes requests **completely through** if `method != GET`
- The `keep-tail-count` setting is fetched from `chrome.storage.sync` (default value = 50 if unset)

---

## Why is this needed? (Background) 🧠

When opening a ChatGPT session, it first fetches the **entire conversation history** in bulk via the following API:

- `https://chatgpt.com/backend-api/conversation/{conversation-id}`

Long conversations can result in massive JSON files, slowing down page initialization and input.

### Why DOM removal didn't solve it

I tried the approach of "lightening the load by removing DOM elements for past prompts/responses" (e.g., thinning out `article[data-testid^="conversation-turn-"]`), but:

- **The core process of fetching the massive JSON and parsing parent-child relationships during initial load** still occurs  
- **Minor freezes upon actions like pressing the send button** still persist

While somewhat effective, simply trimming the DOM did not provide a fundamental solution.

Therefore, this extension reduces the amount of data the browser processes by **minimizing the fetch response (JSON) itself, not the DOM**.

---

ChatGPT Web（`chatgpt.com`）で **やり取りの回数が多いセッションを開いた瞬間の会話一覧取得**（`/backend-api/conversation/{conversation-id}`）が巨大になって重くなる問題に対して、**取得レスポンス（JSON）を縮めてページ初期表示を軽くする**ための Chrome Extension（Manifest V3）です。

---

## できること ✅

- `https://chatgpt.com/backend-api/conversation/{conversation-id}` の **GET** だけをフック
- 返ってきた JSON を **最後の N 往復分 + 最初の 1 往復** を残す形で縮小
- `method != GET` の場合は **完全に素通し**
- 設定値 `keep-tail-count` は `chrome.storage.sync` から取得（未設定ならデフォルト値 = 50）

---

## これは何のため？（背景）🧠

ChatGPT のセッションを開くと、まず以下の API で **会話全履歴**を一括取得します。

- `https://chatgpt.com/backend-api/conversation/{conversation-id}`

会話が長いとこの JSON が巨大になり、ページの初期表示や入力が重くなることがあります。

### DOM 削除方式では解決できなかった理由

「過去のプロンプト / 回答の DOM 要素を remove して軽くする」方式（例: `article[data-testid^="conversation-turn-"]` を間引く）を試しましたが、

- **初期ロード時に巨大な JSON を取得・親子関係などをパースする処理自体**は発生してしまう  
- **送信ボタン押下時などにプチフリーズ**する問題は依然残る

という問題があり、ある程度の効果はあったものの DOM を削るだけでは根本解決ができませんでした。

そのためこの拡張では、**DOM ではなく fetch レスポンス(JSON)そのものを縮める**ことで、ブラウザが処理するデータ量を減らします。