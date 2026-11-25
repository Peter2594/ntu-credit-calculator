# 大學生學分計算表

臺大學生用的畢業學分試算工具。貼上「成績與名次查詢」的成績，就能看到主修、院學士、雙主修、輔系、
學分學程各自的進度。純前端、沒有伺服器，資料只存在瀏覽器的 localStorage。

線上版：<https://peter2594.github.io/ntu-credit-calculator/>

非官方工具，一切以系辦與教務處審查為準。

## 開發

```
npm install
npm run dev        # 開發伺服器
npm test           # vitest
npm run typecheck  # tsc（core 與 ui 兩份設定）
npm run build      # typecheck + vite build
```

推上 `master` 會由 GitHub Actions 自動部署到 GitHub Pages。

程式分成兩層：`src/core` 是純 TypeScript 的計算邏輯（解析成績單、歸類課程、計算進度），
不碰 DOM、可單獨測試；`src/ui` 是 React 介面。

## 資料來源與更新

課程與法規資料都不是寫死在程式裡，而是由 `scripts/` 的程式從官方來源產生。
每學年度規定變動時，重跑對應的程式即可。

| 產出 | 程式 | 來源 | 什麼時候要重跑 |
|---|---|---|---|
| `public/data/requirements/{110..115}.json` | `scripts/fetch-requirements.ts` | 必修課程查詢系統、教務處「轉系、輔系及雙主修相關規定查詢」 | 新學年度的系訂必修與門檻公告後 |
| `src/core/generalCourses.ts` | `scripts/fetch-general-courses.ts` | 課程網的溝通表達與職涯發展課程、新生專題／新生講座清單 | 每學期開課清單更新後 |
| `public/data/programs.json` | `scripts/programs-data.py` | 各學分學程公告的科目表 | 學程新增、停招或科目表改版 |
| `public/data/college-degrees.json` | `scripts/college-degrees.py` | 八個學院的院學士學位修業辦法 | 修業辦法修正後 |
| `scripts/college-course-codes.json` | `scripts/college-course-codes.py`、`scripts/liberal-arts-courses.py` | 課程網課名查詢；文學院院學士課程清單 xlsx | 院學士科目名稱異動後 |
| `public/data/alliance-programs.json`（臺科大） | `scripts/alliance-programs.py` | 臺科大教務處註冊組「各系應修科目表」 | 每學年度的科目表公告後 |
| `public/data/alliance-programs.json`（臺師大） | `scripts/ntnu-structures.py` | 臺師大課架查詢系統的課程架構表 | 每學年度的課架更新後 |

### 執行順序

`alliance-programs.py` 會重建整個 `alliance-programs.json`（含臺師大區塊的預設值），
所以**一定要先跑臺科大、再跑臺師大**：

```
python scripts/alliance-programs.py
python scripts/ntnu-structures.py <臺師大課架 PDF 資料夾> 115
```

院學士同理，課號要先查好再產資料：

```
python scripts/college-course-codes.py
python scripts/liberal-arts-courses.py "115-1文學院院學士學位課程清單.xlsx"
python scripts/college-degrees.py
```

### 臺師大課架要手動下載

臺師大的課架查詢系統擋自動擷取（`CourseStructReportCtrl` 對 curl、urllib 與瀏覽器內的 fetch
都回「系統偵測到異常請求」），所以 PDF 要用瀏覽器下載：

1. 用瀏覽器開 `scripts/ntnu-download.html`
2. 按「開始下載」，允許瀏覽器下載多個檔案（38 系 × 雙主修／輔系 = 76 份）
3. `python scripts/ntnu-structures.py <下載資料夾>`

檔名重複沒關係，每份 PDF 的標題就寫了系名與種類，程式靠內容辨認，下載順序不影響；
資料夾裡其他 PDF 會自動略過。

### 抓取禮儀

所有抓取程式都有固定間隔、把原始 HTML 快取在 `scripts/.cache`，重跑只補抓缺的頁面。
改程式時請保留這些行為，不要對學校伺服器連續大量請求。

## 已知限制

- **醫學院院學士沒有固定科目表**：依修業辦法第三條，基礎醫學與非臨床專業科目由學生所屬學系認定，
  所以工具只算總學分與共同必修及通識。醫學院網站（www.mc.ntu.edu.tw）長期連線被拒，
  現有條文取自教務處公開的 111 學年度第 2 學期第 2 次教務會議紀錄附件。
- **領域專長的課程清單**：各院逐學期公告，法規本身只寫名稱，所以院學士的科目清單只收法規明文列出的。
  文學院的人類學系、戲劇系完全以領域專長構成，目前沒有科目可比對。
- **臺師大企管系與表演藝術學系沒有輔系課架**（表藝採甄選制），選單會標示。
- **院學士科目的課號覆蓋率約六成**：查得到唯一課號的改用課號比對，其餘退回課名比對，
  他系同名課有誤判的可能。
- **科目無法驗證時不顯示「已達標」**：院學士、以及沒有科目表或科目表只列必修的跨校學程，
  進度只會顯示「學分夠了，科目未驗證」，因為工具算得出學分、算不出科目是否符合規定。

## 隱私

- 沒有後端，成績只存在使用者自己的瀏覽器。
- 這個 repo 是公開的，**不要把任何真實成績、學號、姓名或教職員聯絡方式提交進來**。
- 教務處的規定說明本來就附著承辦人姓名與信箱，`src/core/regrules.ts` 的 `redactContacts()`
  在解析階段就拿掉；既有檔案可用 `node scripts/redact-requirements.ts` 清理。
- `src/core/publicData.test.ts` 會掃過 `public/data/` 的每個 JSON，確認沒有信箱、電話與學號，
  擋的是「抓取程式改壞了、個資又被 commit 進來」。
