# ✍️ 童温默書 KidsPrepDictate

[![CI/CD & Clean-Room Gate](https://github.com/jackylawck/KidsPrepDictate/actions/workflows/deploy.yml/badge.svg)](https://github.com/jackylawck/KidsPrepDictate/actions/workflows/deploy.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Privacy](https://img.shields.io/badge/Privacy-Zero--Data--Retention-00796B)](#privacy-governance)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> **專為香港小學學童設計的中英雙科互動默書 PWA 工具**  
> **A Zero-Trust, Offline-Ready Bilingual Dictation PWA Built for Hong Kong Primary Students**

🌐 **線上體驗 / Live Demo**：[https://jackylawck.github.io/KidsPrepDictate/](https://jackylawck.github.io/KidsPrepDictate/)  
📖 **語言導覽 / Language**：[🇭🇰 繁體中文說明](#zh-doc) ｜ [🇬🇧 English Documentation](#en-doc)

---

<a id="zh-doc"></a>
## 🇭🇰 繁體中文說明

### 1. 專案簡介與設計理念
**童温默書（KidsPrepDictate）** 旨在減輕香港家長陪同子女溫習中英文默書的壓力，同時培養學童自主學習與正確書寫筆順的習慣。全系統採用 **純前端零伺服器架構（Pure Client-Side PWA）**，無需註冊帳號、無廣告干擾，支援離線使用並可直接加入 iPad / iPhone / Android 主畫面。

### 2. 核心功能亮點
* **🇭🇰 香港標準繁體字庫與雙引擎筆順驗證**
  * **1,464 個香港小學常用字標準筆順索引**：預編譯離線字庫（`public/data/`），結合「筆順序列與骨架向量比對」及「64×64 空間視覺光柵化掃描（含墨水密度懲罰 `pixelRatioPenalty`）」雙引擎，既能精準攔截亂畫塗鴉與筆畫數錯誤，亦支援筆順倒序的溫和提醒。
  * **無家長自由寫字模式**：小朋友可直接在米字格手寫，系統即時辨識 Top 5 候選字並以粵語（`zh-HK`）朗讀。
  * **缺字友善防線（`isFallback`）**：遇上字庫尚未收錄的生僻字時，自動啟用安全降級放行並以半透明樣式標記，確保默書流程不卡關。
  * **通關狀態閉環鎖定**：完成整段默書後自動清空墨水、收起作答按鈕並鎖定畫布（`TraceCanvas.lock()`），防止誤觸塗鴉。
* **🇬🇧 英文「聽聲串字」閉環訓練**
  * 自動優先調用標準英式英語（`en-GB`）或美式英語（`en-US`）語音引擎，支援 **正常語速** 與 **🐢 慢慢聽（`0.55x` 慢速）**。
  * 內建大按鍵防誤觸虛擬鍵盤（支援長按連續刪除），亦支援切換系統／藍牙實體鍵盤（適合高小學生）。
  * 提供 **初小寬鬆容錯（±1 字母 Levenshtein 編輯距離）** 與三段式字母提示（首字母 / 前兩字母 / 完整單字）。
* <a id="privacy-governance"></a>**🛡️ 隱私與資料治理（Privacy-by-Design）**
  * **零資料回傳（Zero-Data-Retention）**：所有自訂課文、手寫筆跡與學習進度（`localStorage`）僅儲存在使用者本機瀏覽器，絕不上傳至任何外部伺服器。
  * **企業級安全標頭**：配置嚴格的 Content Security Policy（CSP）與 `Permissions-Policy`，全面封鎖鏡頭、麥克風、定位與感測器權限。

### 3. 技術架構與目錄結構
```text
KidsPrepDictate/
├── .github/workflows/deploy.yml   # GitHub Actions 字庫門禁、乾淨室測試與 Pages 自動部署
├── public/
│   ├── data/*.json                # 預編譯香港小學繁體字筆順與骨架向量字庫
│   └── manifest.json              # PWA Manifest 與桌面圖示配置
├── scripts/                       # 企業級資料治理管線 (ETL & Audit)
│   ├── prepare-hk-chars.mjs       # 清洗與去重香港小學字表
│   ├── compile-dict.ts            # 編譯部首、粵拼與普拼索引
│   ├── convert-mmah.mjs           # Make Me a Hanzi 筆順矢量轉換
│   ├── build-data.ts              # 三態治理建置 (HK_VERIFIED / LIKELY / DIVERGENT)
│   └── audit-curriculum.ts        # 課綱字庫覆蓋率審計報告
├── src/
│   ├── core/dictation-matcher.ts  # 雙引擎手寫筆跡座標轉換與比對演算法
│   ├── ui/canvas-trace.ts         # 高 DPI 雙層 Canvas 渲染 (RAF 節流與狀態鎖定)
│   ├── ui/english-keyboard.ts     # 防抖虛擬鍵盤與長按刪除模組
│   ├── i18n.ts                    # 繁中 / 英文雙語即時切換引擎
│   ├── main.ts                    # 應用程式主控制器與語音引擎調度
│   ├── style.css                  # Safe-Area 適配與深色模式自動支援
│   └── types.ts                   # 嚴格唯讀 TypeScript 資料契約
├── tests/
│   └── dictation-matcher.spec.ts  # Vitest 自動化單元測試套件
└── LICENSE                        # MIT 開放原始碼授權條款
```

### 4. 本地開發與指令說明
確保已安裝 Node.js >= 20 與 pnpm >= 8（建議 pnpm v12）：

```bash
# 安裝相依套件
pnpm install

# 啟動本地開發伺服器（支援區網 iPad / 手機實機連線測試）
pnpm dev

# 執行 TypeScript 嚴格型別檢查
pnpm typecheck

# 執行 Vitest 單元測試
pnpm test:run

# 構建生產環境靜態檔案
pnpm build
```

> **資料管線提示**：專案已於 `public/data/` 內建預編譯字庫 JSON，日常開發與部署無需重跑資料建置。僅當需從原始 Make Me a Hanzi 語料庫（`raw-data/graphics.txt`）重新生成字庫時，才執行 `pnpm data:pipeline`。

### 5. 授權條款
本專案採用 [MIT License](./LICENSE) 開放原始碼授權。

---

<a id="en-doc"></a>
## 🇬🇧 English Documentation

### 1. Overview
**KidsPrepDictate** is an open-source, offline-capable Progressive Web App (PWA) tailored for Hong Kong primary school students preparing for Traditional Chinese and English dictation. Built with a Pure Client-Side, Zero-Backend architecture, it delivers distraction-free, low-latency handwriting and spelling practice on iPads, smartphones, and desktops.

### 2. Key Features
* **🇭🇰 Traditional Chinese Stroke & Glyph Verification**
  * **1,464 HK Standard Characters**: Backed by a precompiled offline dataset (`public/data/`) and a dual-engine matcher combining sequential stroke-order/median vector evaluation with a 64×64 rasterized visual engine (featuring an ink-density penalty `pixelRatioPenalty` to block random scribbles).
  * **Free-Write Mode**: Students can practice handwriting independently without parent setup; the engine recognizes top-5 candidate characters and pronounces them in Cantonese (`zh-HK`).
  * **Graceful Missing-Glyph Fallback (`isFallback`)**: Unindexed rare characters are safely handled with a subtle visual indicator so student progress is never blocked.
  * **Completion State Lock**: Automatically clears ink, hides action controls, and locks the canvas (`TraceCanvas.lock()`) upon finishing a passage.
* **🇬🇧 English Audio-to-Spelling Loop**
  * Prioritizes `en-GB` / `en-US` Web Speech synthesis with normal speed and `0.55x` **Slow Listen** playback.
  * Custom touch-optimized QWERTY keyboard featuring double-tap zoom prevention and hold-to-delete, plus optional hardware/system keyboard support.
  * Configurable Junior Tolerance (Levenshtein distance = 1) and progressive hint levels (First Letter / First 2 Letters / Full Word).
* **🛡️ Privacy-by-Design & Governance-as-Code**
  * **Zero-Data-Retention**: All custom passages, handwriting strokes, and session checkpoints reside strictly in local browser storage (`localStorage`). No telemetry, tracking, or server uploads.
  * **Hardened Security Posture**: Enforces strict Content Security Policy (CSP) and `Permissions-Policy` denying camera, microphone, geolocation, and sensor access, alongside a CI/CD clean-room gate verifying precompiled dataset integrity before deployment.

### 3. Quick Start & Scripts
Requires Node.js >= 20 and pnpm >= 8 (pnpm v12 recommended):

```bash
# Install dependencies
pnpm install

# Start dev server (exposed on LAN for direct iPad touch testing)
pnpm dev

# Run strict TypeScript typechecking
pnpm typecheck

# Run automated unit tests via Vitest
pnpm test:run

# Build production bundle
pnpm build
```

> **Note on ETL Pipeline**: Precompiled stroke JSON files are already committed in `public/data/`. Only run `pnpm data:pipeline` if you have placed raw Make Me a Hanzi source files (`raw-data/graphics.txt`) locally and wish to regenerate the dataset.

### 4. License
This project is licensed under the [MIT License](./LICENSE) — see the LICENSE file for details.
