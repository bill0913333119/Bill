# 工地缺失改善管理系統

工程師在工地用手機 **1 分鐘內** 完成：拍照 → 點選位置與工種 → 語音說明 → 自動產出 A4 PDF → 一鍵傳到 LINE。
廠商從 LINE 點連結回傳改善後照片，工程師複查結案，形成完整閉環。

```
工程師（PWA / LIFF）        後端 API + PostgreSQL           廠商（免登入網頁）
 拍照・快選・語音  ──同步──▶  缺失／照片／PDF／歷程  ◀──回報──  改善後照片＋說明
 產出 A4 PDF               ──推播──▶ LINE 工地群組            ◀── LINE 卡片「回報改善」
 複查：結案／退回 ◀────────────────────────────────────────────┘
```

## 功能

| 需求 | 實作 |
|---|---|
| 3 步驟精靈 | ① 拍照 ② 位置分類 ③ 說明指派，底部固定大按鈕，單手可操作，每步新人提示 |
| 卡片式快選 | 樓層九宮格、棟別、工種圖示卡、常見缺失項目標籤（工種／項目／廠商由後端維護） |
| 語音輸入 | Web Speech API（zh-TW），自動補全形標點 |
| 照片處理 | 1～3 張，長邊 1600px、≤1.5MB，自動嵌入日期＋案名浮水印 |
| 聯動與預設 | 選工種自動帶入分包商；限期預設 +3 天；嚴重度預設「一般」 |
| 離線優先 | 草稿每次變動存入 IndexedDB；無網路照常建單，恢復連線自動同步 |
| 單號 | `DF-YYYYMMDD-NNN`，由伺服器確認，多台手機同時開單不撞號 |
| A4 PDF | HTML/CSS 版面 → PDF；結案後重新產出，含改善說明、改善後照片與「已結案」章 |
| LINE 分享 | LIFF 內：shareTargetPicker 傳**圖文卡片**（含「回報改善」「下載 PDF」按鈕）；一般瀏覽器：Web Share API 直接傳 PDF 檔 |
| LINE 官方帳號 | Rich Menu（新增缺失／缺失紀錄／使用說明）；群組輸入「綁定 專案名稱」後，廠商回報與退回會推播到群組 |
| 廠商回報 | 每筆缺失有專屬連結 `/#/reply/<token>`，免登入拍照上傳改善後照片 |
| 複查 | 待改善 → 待複查 → 已結案；可退回並附原因（廠商頁會顯示），全程記錄於 `defect_logs` |

## 快速開始

```bash
# 1. 資料庫（任一 PostgreSQL 14+ 或 Supabase）
createdb defect

# 2. 後端（啟動時自動建立資料表與預設資料）
cd server && npm install
DATABASE_URL=postgres://user:pass@localhost:5432/defect npm run dev     # :3000

# 3. 前端（另一個終端機；/api 自動轉送到 :3000）
npm install && npm run dev                                              # :5173
```

正式部署：`npm run build` 後由後端一併提供前端（`dist/`），或直接 `docker compose up -d`。
**必須使用 HTTPS**，相機、語音、分享與 LIFF 才能運作。環境變數見 `.env.example`。

### 測試

```bash
npm test                                                     # 前端單元測試
cd server && TEST_DATABASE_URL=postgres://.../defect_test npm test   # API 整合測試（會清空該資料庫）
```

## LINE 設定步驟

1. [LINE Developers](https://developers.line.biz/) 建立 **Messaging API channel**，取得 Channel secret 與 Channel access token。
2. 同一 Provider 建立 **LINE Login channel → LIFF**：Endpoint URL 填 `PUBLIC_URL`，Size 選 Full，Scope 勾 `chat_message.write`，並開啟 **shareTargetPicker**。
3. 設定 `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`LIFF_ID` 後重啟後端。
4. Messaging API 的 Webhook URL 設為 `https://<你的網域>/api/line/webhook`，開啟「Use webhook」與「Allow bot to join group chats」。
5. 建立常駐選單：`cd server && LINE_CHANNEL_ACCESS_TOKEN=... LIFF_ID=... npm run richmenu`
6. 將官方帳號加入工地群組，在群組輸入 `綁定 專案名稱`（需與 App 內專案名稱相同）。

## 照片儲存

- 預設存於伺服器本機 `UPLOAD_DIR`，由 `/files/...` 提供（檔名為隨機 UUID）。
- 設定 `S3_*` 改用 AWS S3 或 Cloudflare R2；`S3_PUBLIC_URL` 需可公開讀取並允許前端網域的 CORS（PDF 產生時需讀取照片）。

## API

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/config` | 前端執行期設定（LIFF ID、是否需金鑰） |
| GET | `/api/presets` | 工種、常見項目、分包商 |
| POST | `/api/uploads` | 上傳照片／PDF（原始 body，Content-Type 為 image/* 或 application/pdf） |
| GET | `/api/defects?project=&status=` | 缺失列表 |
| PUT | `/api/defects/:id` | 建立或更新（冪等，供離線重送） |
| PATCH | `/api/defects/:id` | 結案／退回／重開、附加 PDF |
| GET / POST | `/api/reply/:token` | 廠商讀取缺失／送出改善回報 |
| POST | `/api/reply/:token/photos` | 廠商上傳改善後照片 |
| POST | `/api/line/webhook` | LINE Webhook（簽章驗證） |

設定 `APP_TOKEN` 時，工程師端 API 需帶 `Authorization: Bearer <APP_TOKEN>`（App「設定」頁輸入）。

## 專案結構

```
src/                      前端（Vue 3 + Tailwind PWA）
  App.vue                 主畫面、路由（#/reply/<token>、#/records）
  store.js                狀態、自動暫存、雲端同步
  lib/                    api、pdf、share、liff、image、speech、storage
  components/             三個步驟、完成／複查頁、PDF 版面、紀錄列表、廠商回報頁
shared/flex.js            LINE Flex 圖文卡片（前後端共用）
server/                   後端（Express + PostgreSQL）
  db/schema.sql, seed.sql 資料表與預設工種／項目／廠商
  src/app.js              API 路由
  src/repo.js             資料存取
  src/line.js, storage.js LINE Messaging API、本機／S3 儲存
  scripts/setup-richmenu.js
```

## 後續可擴充

- 後台管理介面：維護分包商、常用項目、帳號權限（目前直接編輯資料表）。
- 以 LIFF ID Token 驗證工程師身分取代共用金鑰。
- 逾期自動提醒（排程掃描 `due_date` 推播群組）。
