# 工地缺失改善管理系統

工程師在工地用手機 **1 分鐘內** 完成：拍照 → 點選位置與工種 → 語音說明 → 自動產出 A4 PDF → 一鍵傳到 LINE。

## 功能（MVP）

| 需求 | 實作 |
|---|---|
| 3 步驟精靈 | ① 拍照 ② 位置分類 ③ 說明指派，底部固定大按鈕，單手可操作 |
| 卡片式快選 | 樓層九宮格（B3～15F、RF…）、棟別、工種圖示卡、常見缺失項目標籤 |
| 語音輸入 | Web Speech API（zh-TW），自動補全形標點 |
| 照片處理 | 1～3 張，長邊 1600px、≤1.5MB，自動嵌入日期＋案名浮水印 |
| 聯動與預設 | 選工種自動帶入分包商；限期預設 +3 天；嚴重度預設「一般」 |
| 防呆 | 每步必填檢查；草稿每次變動自動存入 IndexedDB，關閉或斷網不遺失 |
| A4 PDF | HTML/CSS 版面 → html2canvas → jsPDF，中文無需嵌字型 |
| LINE 分享 | 手機以 Web Share API 直接傳 PDF 檔；桌機改為下載＋LINE 文字分享 |
| 追蹤 | 紀錄列表（待改善／已完成）、逾期紅框、一鍵結案 |
| PWA | manifest + Service Worker，可加入主畫面、離線開啟 |

## 開發

```bash
npm install
npm run dev      # http://localhost:5173（手機同網段可用 --host 位址測試）
npm test         # 單元測試
npm run build    # 產出 dist/，可部署到任何靜態主機（需 HTTPS 才能使用相機、語音、分享）
```

## 專案結構

```
src/
  App.vue                 主畫面、步驟導覽、底部操作列
  store.js                全域狀態與自動暫存
  data/presets.js         樓層、工種、常見項目、分包商預設值
  lib/defect.js           單號、預設期限、廠商推薦、必填檢查
  lib/image.js            照片壓縮與浮水印
  lib/pdf.js              A4 PDF 產生
  lib/share.js            LINE / Web Share 分享
  lib/speech.js           語音轉文字
  components/             三個步驟、完成頁、PDF 版面、紀錄列表
db/schema.sql             PostgreSQL / Supabase 資料表（後端階段使用）
```

## 下一階段

1. 後端 API（NestJS 或 FastAPI）＋ `db/schema.sql`，照片上傳 S3 / R2，多人同步。
2. 分包商與常用項目改由後台維護（`data/presets.js` 換成 API）。
3. LINE LIFF＋官方帳號 Rich Menu：免安裝開啟，傳送後在群組產生圖文卡片與下載連結。
4. 改善回報：廠商上傳改善後照片，工程師複查結案。
