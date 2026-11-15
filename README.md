# Fitness Tracker

Fitness Tracker 是手機優先的繁體中文個人健身 PWA。首次開啟時只有內置動作庫，由你建立自己的 Workout、Template、體重與個人最佳紀錄。網站可部署為 GitHub Pages 靜態網站。

## 功能

- **Workout** 支援日期補記、空白或 Template 開始、Sets、動作備註、自動儲存草稿，以及按動作複製該訓練日期之前的最近紀錄。可篩選、修改、複製及刪除歷史，也可查看個別動作的重量與訓練量。
- **Weight** 支援同日多次測量、修改及刪除。圖表保留原始測量日期及時間，可獨立切換原始數值與七日移動平均。七日平均先算每日平均，再平均該期間有測量的日子，並顯示測量日數。
- **PR** 從 Workout 及手動 PR 的原始紀錄重算每次嚴格增重的突破。相同重量保留較早的成績。手動 PR 獨立於 Workout 次數及訓練量。
- **More** 有 31 個內置動作及自訂動作管理、Template 管理、JSON 備份與還原、CSV 匯出及備份提醒。

使用已有紀錄的動作時，名稱可修改，重量類型及 PR 設定會鎖定。封存會把動作從新增時的選單移除，舊紀錄仍可查閱。自體重量動作只輸入 Reps。輔助動作追蹤最低輔助重量及 Reps。啞鈴動作的訓練量以每隻重量 × Reps 計算。

## 技術與結構

React、TypeScript、Vite、Tailwind CSS、Dexie.js、Recharts、Lucide、Workbox、GitHub Actions。字型和圖片均隨網站提供。

| 路徑 | 職責 |
| --- | --- |
| `src/model.ts`、`src/exercises.ts` | 資料定義、驗證、本地日期工具及內置動作 |
| `src/db.ts` | IndexedDB schema、CRUD、草稿版本檢查及復原交易 |
| `src/fitness.ts` | Workout 驗證與正規化、舊紀錄搜尋、PR、體重及動作統計 |
| `src/backup.ts` | 檔案驗證、引用檢查及匯出 |
| `src/app.tsx`、`src/workout*.tsx`、`src/weight.tsx`、`src/pr.tsx`、`src/more.tsx` | 分頁及編輯流程 |
| `vite.config.ts`、`.github/workflows/deploy.yml` | 靜態建置、PWA 及部署 |
| `tests/` | Vitest 邏輯與 IndexedDB 測試，以及 Playwright 瀏覽器測試 |

Workout、動作及 Sets 在同一筆紀錄內保存，保留順序和各自的 ID。Template 保存名稱、動作順序及選填的每動作組數，再加上 ID 和時間戳。套用的組數會建立空白 Sets，由使用者填寫重量與 Reps。歷史 Workout 保留原 Template 的 ID 與當時名稱，因此可以查閱或篩選已刪除 Template 建立的紀錄。IndexedDB schema 從 v1 開始，可透過 Dexie 追加 migration。備份的 Schema Version 另外用於檔案格式相容。

## 本機開發

需要 Node.js 22.12 或以上，建議使用 Node.js 24 LTS 和隨附的 npm。

```sh
npm ci
npm run dev
```

瀏覽 Vite 終端顯示的網址，預設為 `http://localhost:5173/fitness-tracker/`。要檢查正式建置與離線功能，使用：

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

正式檔案輸出至 `dist/`。Service Worker 在正式建置啟用。首次連線時會快取網站資源，完成後可以離線重新開啟、讀寫及匯出本地紀錄。從瀏覽器的安裝選單或 iOS Safari 的分享選單「加入主畫面」即可安裝。

## 瀏覽器測試

```sh
npx playwright install chromium webkit
npm run build
npm run test:e2e
```

測試會以 Desktop Chromium、Mobile Chromium 及 iPhone 尺寸的 WebKit 設定檔執行，涵蓋 Workout 和 Template、草稿復原、Copy Previous、PR 重算、體重圖表、JSON 還原及離線子路徑。可用 `PLAYWRIGHT_CHANNEL=chrome` 指定本機已安裝的 Chrome。測試在臨時瀏覽器環境使用測試資料。

## GitHub Pages 部署

1. 將原始碼與 `package-lock.json` 提交到 GitHub repository 的 `main` 分支。
2. 在 GitHub repository 的 **Settings → Pages → Build and deployment**，將 **Source** 設為 **GitHub Actions**。
3. 推送 `main`，或在 **Actions** 手動執行 **Deploy Fitness Tracker to GitHub Pages**。Workflow 會執行 `npm ci`、測試、建置，然後發佈 `dist/`。
4. 從成功的部署工作取得網站網址。例如 `https://USERNAME.github.io/fitness-tracker/`。

Actions 從 `configure-pages` 自動取得 repository base path，改 repository 名稱後會在下一次部署套用。手動建置的預設路徑為 `/fitness-tracker/`。如需其他路徑，用 `PAGES_BASE_PATH=/my-repo/ npm run build`。在 PowerShell 可先執行 `$env:PAGES_BASE_PATH = '/my-repo/'`，再執行 `npm run build`。自訂網域或使用者根網站用 `/`。分頁用 hash routing，例如 `/fitness-tracker/#/more/backup`，重新整理仍會載入原網站的 `index.html`。 [Vite 靜態部署指南](https://vite.dev/guide/static-deploy.html#github-pages) · [GitHub Pages 自訂 Workflow 文件](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## 本地儲存、備份與私隱

健身資料只寫入瀏覽器的 IndexedDB。Service Worker 快取正式網站的靜態資源。首次載入或網站更新會從站點下載程式檔案。轉換網域、瀏覽器設定檔或裝置後，請用 JSON 備份還原；同一網域的不同路徑受瀏覽器相同的 origin 儲存規則管理。

在 **More → 備份與還原** 選擇匯出 JSON，並從瀏覽器下載項目確認檔案已保存。CSV 可選擇 Workout Sets、體重或手動 PR，供個別分析。還原時選擇 JSON，核對筆數及檔名，勾選同意後才會在單一交易內完整取代目前資料。PR 與體重統計隨現有原始資料更新。

首次開啟滿七日，或距上次觸發匯出已滿七日，網站會在開啟時提示備份。稍後提醒會延後一天。瀏覽器清除資料、裝置更換或故障均可能使本地紀錄消失。請把備份另行保存，並避免將任何真實紀錄、備份及個人資訊提交到 GitHub。

## 主圖

`public/workout-hero.webp` 以內建 imagegen 生成並轉為 WebP。生成提示詞為：

> Create a photorealistic wide editorial photograph for the right side of a premium dark fitness log web app hero. Low-angle close-up of a loaded Olympic barbell on matte black rubber floor. Main three large dark metal weight plates at 69% from the left, bar angling diagonally toward the upper right with a gym rack receding behind. Atmospheric charcoal navy gym, cool cobalt and violet rim light tracing plate edges, realistic textured forged metal, soft focus background, strong blacks, and controlled contrast. Left third almost entirely black negative space fading in from the gym. No people, no writing, no numbers, no branding, no UI. Landscape 2:1 composition.
