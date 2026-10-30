# 用 Render 部署（免費試用）

部署完成後會得到一個 `https://site-defect.onrender.com` 這類網址，工程師與廠商用手機直接開啟即可。
整個系統（網站、API、資料庫）由 repo 根目錄的 `render.yaml` 一次建立，目前設定為**免費方案**。

> 方案限制與價格以 Render 官網為準：<https://render.com/pricing>。以下數字為撰寫時的參考值。

## 一鍵部署

點這個連結：**<https://render.com/deploy?repo=https://github.com/bill0913333119/Bill>**

1. 選 **GitHub** 登入，允許 Render 讀取 `Bill` 這個 repo。
2. 畫面會列出 `site-defect`（網站）與 `site-defect-db`（資料庫），方案皆為 Free。
3. 要求填寫 `PUBLIC_URL`、`LINE_…`、`LIFF_ID` 時**全部留空**。
4. 按 **Apply**（或 Deploy Blueprint），等 5～10 分鐘，狀態顯示 **Live** 即完成。
5. 點 `site-defect`，左上角的 `https://….onrender.com` 就是你的網址。
6. 同一頁 **Environment** → `APP_TOKEN` 旁的眼睛圖示 → 複製。
7. 手機打開網址 → **⚙️ 設定**：填工程師姓名、預設專案，「雲端連線金鑰」貼上 `APP_TOKEN`，顯示「☁️ 已連線雲端」即成功。
8. 加到主畫面：Android Chrome「⋮ → 加到主畫面」；iPhone Safari「分享 → 加入主畫面」。
9. 照 `docs/真機測試清單.md` 用 Android 與 iPhone 各測一次。

金鑰請只給自家工程師。廠商回報連結不需要金鑰。

## 免費方案的限制

| 項目 | 限制 | 影響 |
|---|---|---|
| 網站休眠 | 閒置約 15 分鐘後休眠 | 第一個人打開時要等約 1 分鐘；App 已開著或離線暫存的資料不受影響 |
| 資料庫期限 | 免費資料庫建立後有使用期限（撰寫時約 30 天） | **到期前要升級，否則資料會被刪除**，Render 會先寄信提醒 |
| 資料庫容量 | 約 1 GB | 照片與 PDF 也存在資料庫，約可存 200～500 張缺失單 |
| Shell | 免費方案無法使用 | 建立 LINE 常駐選單需在自己電腦執行，見下方 |

照片與 PDF 存在資料庫（`STORAGE=db`），所以網站休眠重啟**不會**遺失照片。

## 試用滿意後升級（資料保留）

在 Render Dashboard 直接改方案，不需要重新部署或搬資料：

1. **資料庫：** `site-defect-db` → **Info** 頁的 Instance Type → 改為付費方案（例如 Basic 256MB，約 US$6／月）。
2. **網站：** `site-defect` → **Settings → Instance Type** → 改為 Starter（約 US$7／月），不再休眠。

照片繼續存資料庫即可；量大時可改存 Cloudflare R2（見最下方）。

## 之後的維護

- **更新程式：** 合併進 `main` 後，Render 會自動重新部署。
- **看錯誤紀錄：** `site-defect` → **Logs**。
- **換成自有網域：** `site-defect` → **Settings → Custom Domains**，完成後把 `PUBLIC_URL` 設成 `https://你的網域`，再按 **Manual Deploy**。

## 接上 LINE 官方帳號（可之後再做）

1. 照 README「LINE 設定步驟」在 LINE Developers 建立 Messaging API 與 LIFF。
   - LIFF 的 Endpoint URL 填 Render 網址。
   - Webhook URL 填 `https://<Render 網址>/api/line/webhook`。
2. 在 `site-defect` → **Environment** 填入 `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`LIFF_ID`，儲存後自動重新部署。
3. 建立 LINE 常駐選單：在自己電腦（需安裝 Node.js 20 以上）執行
   ```bash
   git clone https://github.com/bill0913333119/Bill && cd Bill/server && npm install
   LINE_CHANNEL_ACCESS_TOKEN=… LIFF_ID=… npm run richmenu
   ```
   升級為付費方案後，也可改在 `site-defect` → **Shell** 執行 `cd server && npm run richmenu`。
4. 把官方帳號加入工地群組，在群組輸入 `綁定 專案名稱`。

## 照片改存 Cloudflare R2（選用）

在 **Environment** 填入 `S3_BUCKET`、`S3_ENDPOINT`、`S3_PUBLIC_URL`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_REGION=auto`，設定後新照片改存 R2（舊照片仍在資料庫可正常顯示）。
R2 的公開網址需允許網站網域的 CORS，PDF 才能讀到照片。
