# 英文學習 App（獨立專案）

> 本資料夾與根目錄的工地缺失管理系統、YouTube 語音翻譯**完全無關**，有自己的 `package.json`，不共用任何程式碼或相依套件。

## 功能
- 點擊句子中的英文單字 → 跳出視窗顯示單字、音標、中文翻譯
- 自動朗讀發音（`react-native-tts`），可按「再聽一次」
- 查詢不分大小寫，會忽略單字前後的標點（例如 `Apple,`）
- 字典沒收錄的單字仍會朗讀，並顯示「字典尚未收錄」

## 結構
```
english-learning-app/
├── index.js                 # 註冊 App
├── App.js                   # 進入點
└── src/
    ├── EnglishLearningApp.js  # 主畫面與彈出視窗
    └── dictionary.js          # 單字資料庫（key 用小寫）
```

## 新增單字
編輯 `src/dictionary.js`：
```js
cat: { phonetic: '/kæt/', translation: '貓' },
```

## 執行
`react-native-tts` 是原生模組，**無法在 Expo Go 執行**，需用 React Native CLI（或 Expo dev build）：
```bash
npx @react-native-community/cli init EnglishLearningApp   # 產生 android/ ios/ 原生專案
# 把本資料夾的 App.js、index.js、src/ 複製進去，再：
npm install react-native-tts
cd ios && pod install && cd ..   # 僅 iOS
npm run android                  # 或 npm run ios
```
