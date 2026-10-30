# 用 Render 部署

部署完成後會得到一個 `https://site-defect.onrender.com` 這類網址，工程師與廠商用手機直接開啟即可。
整個系統（網站、API、資料庫、照片儲存）由 repo 根目錄的 `render.yaml` 一次建立。

> 價格與方案限制以 Render 官網為準：<https://render.com/pricing>。以下金額為撰寫時的參考值。

## 會建立哪些東西

| 資源 | 方案 | 用途 | 參考費用 |
|---|---|---|---|
| `site-defect` 網站服務 | Starter | 前端 App＋API，新加坡機房 | 約 US$7／月 |
| 5 GB 磁碟（掛在 `/var/data`） | — | 保存照片與 PDF | 約 US$0.25／GB／月 |
| `site-defect-db` PostgreSQL 16 | Basic 256MB | 缺失單、日誌、歷程 | 約 US$6／月 |

**為什麼不用免費方案：** 免費網站服務不能掛磁碟，照片與 PDF 會在每次重新部署或重啟時消失；免費資料庫有使用期限，到期會被刪除。正式工地資料不建議使用。

## 部署步驟（約 15 分鐘）

1. 到 <https://dashboard.render.com> 用 GitHub 帳號登入，並授權 Render 讀取 `bill0913333119/Bill`。
2. 左上 **New → Blueprint**，選擇 `bill0913333119/Bill`，分支 `main`。
3. Render 會讀取 `render.yaml`，列出上表三項資源。
   - 要求填寫 `PUBLIC_URL`、`LINE_…`、`LIFF_ID` 時**全部先留空**，之後再補。
4. 按 **Apply**，等待建置完成（第一次約 5～10 分鐘）。服務狀態顯示 **Live** 即完成。
   - 若名稱 `site-defect` 已被使用，網址會多一段亂碼，以畫面上顯示的為準。
5. 取得工程師連線金鑰：點 `site-defect` → **Environment** → `APP_TOKEN` 右側的眼睛圖示 → 複製。
6. 手機開啟網址 → **⚙️ 設定**：
   - 填工程師姓名、預設專案。
   - 「雲端連線金鑰」貼上 `APP_TOKEN`。
   - 按完成，設定頁顯示「☁️ 已連線雲端」即成功。
7. 加到主畫面：Android Chrome「⋮ → 加到主畫面」；iPhone Safari「分享 → 加入主畫面」。
8. 照 `docs/真機測試清單.md` 用 Android 與 iPhone 各測一次。

**金鑰請只給自家工程師。** 廠商回報連結不需要金鑰，所以廠商拿不到也能回報。

## 之後的維護

- **更新程式：** 程式合併進 `main` 後，Render 會自動重新部署，不用手動操作。
- **看錯誤紀錄：** `site-defect` → **Logs**。
- **備份：** 付費資料庫由 Render 自動備份；建議每月另外在 **site-defect-db → Backups** 確認一次。
- **換成自有網域：** `site-defect` → **Settings → Custom Domains** 加入網域並照指示設定 DNS，完成後把 `PUBLIC_URL` 設成 `https://你的網域`，再按 **Manual Deploy**。

## 接上 LINE 官方帳號（可之後再做）

1. 照 README「LINE 設定步驟」在 LINE Developers 建立 Messaging API 與 LIFF。
   - LIFF 的 Endpoint URL 填 Render 網址。
   - Webhook URL 填 `https://<Render 網址>/api/line/webhook`。
2. 在 `site-defect` → **Environment** 填入 `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`LIFF_ID`，儲存後會自動重新部署。
3. 建立 LINE 常駐選單：在 `site-defect` → **Shell** 執行
   ```bash
   cd server && npm run richmenu
   ```
4. 把官方帳號加入工地群組，在群組輸入 `綁定 專案名稱`。

## 照片改存 Cloudflare R2（選用）

照片量大或想把網站降為免費方案時，可改存 R2：
在 **Environment** 填入 `S3_BUCKET`、`S3_ENDPOINT`、`S3_PUBLIC_URL`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_REGION=auto`。
R2 的公開網址需允許網站網域的 CORS，PDF 才能讀到照片。
