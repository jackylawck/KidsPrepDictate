# ✍️ 童温默書 KidsPrepDictate

[![CI/CD & Clean-Room Gate](https://github.com/jackylawck/KidsPrepDictate/actions/workflows/deploy.yml/badge.svg)](https://github.com/jackylawck/KidsPrepDictate/actions/workflows/deploy.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Privacy](https://img.shields.io/badge/Privacy-Zero--Data--Retention-00796B)](#3-隱私與資料治理-privacy--data-governance)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> **專為香港小學學童設計的中英雙科互動默書 PWA 工具**
> **A Zero-Trust, Offline-Ready Bilingual Dictation PWA Built for Hong Kong Primary Students**

🌐 **線上體驗 / Live Demo**：[https://jackylawck.github.io/KidsPrepDictate/](https://jackylawck.github.io/KidsPrepDictate/)

---

## 🇭🇰 繁體中文說明

### 1. 專案簡介與設計理念
**童温默書（KidsPrepDictate）** 旨在減輕香港家長陪同子女溫習中英文默書的壓力，同時培養學童自主學習與正確書寫筆順的習慣。全系統採用 **純前端零伺服器架構（Pure Client-Side PWA）**，無需註冊帳號、無廣告干擾，支援離線使用並可直接加入 iPad / iPhone / Android 主畫面。

### 2. 核心功能亮點
* **🇭🇰 香港標準繁體字庫與雙引擎筆順驗證**
  * 內建 **1,464 個香港小學常用字標準筆順索引**，結合「筆順序列比對」與「字形空間掃描（無順序容錯）」雙引擎，既能糾正筆畫數量與字形結構，亦避免過度嚴苛挫傷初小學生信心。
  * 支援 **無家長自由寫字模式**：小朋友可直接在米字格手寫，系統即時辨識候選字並以粵語朗讀。
  * **缺字防線機制**：遇上字庫尚未收錄的生僻字時，自動啟用安全降級放行（`isFallback`），確保默書流程不卡死。
* **🇬🇧 英文「聽聲串字」閉環訓練**
  * 自動優先調用標準英式英語（`en-GB`）或美式英語（`en-US`）語音引擎，支援 **正常語速** 與 **🐢 慢慢聽（0.55x 慢速）**。
  * 內建大按鍵防誤觸虛擬鍵盤（支援長按連續刪除），亦支援切換系統／藍牙實體鍵盤（適合高小學生）。
  * 提供 **初小寬鬆容錯（±1 字母編輯距離）** 與三段式字母提示（首字母 / 前兩字母 / 完整單字）。
* **🛡️ 隱私與資料治理（Privacy-by-Design）**
  * **零資料回傳（Zero-Data-Retention）**：所有課文、手寫筆跡與學習進度（`localStorage`）僅儲存在使用者本機瀏覽器，絕不上傳至任何外部伺服器。
  * **企業級安全標頭**：配置嚴格的 Content Security Policy（CSP）與 `Permissions-Policy`，全面封鎖鏡頭、麥克風、定位與感測器權限。

### 3. 技術架構與目錄結構
```text
KidsPrepDictate/
├── .github/workflows/deploy.yml   # GitHub Actions 乾淨室測試與 Pages 自動部署
├── public/                        # PWA Manifest、桌面圖示與編譯後字庫 JSON
├── scripts/                       # 企業級資料治理管線 (ETL & Audit)
│   ├── prepare-hk-chars.mjs       # 清洗與去重香港小學字表
│   ├── compile-dict.ts            # 編譯部首、粵拼與普拼索引
│   ├── convert-mmah.mjs           # Make Me a Hanzi 筆順矢量轉換
│   ├── build-data.ts              # 三態治理建置 (HK_VERIFIED / LIKELY / DIVERGENT)
│   └── audit-curriculum.ts        # 課綱字庫覆蓋率審計報告
├── src/
│   ├── core/dictation-matcher.ts  # 雙引擎手寫筆跡座標轉換與比對演算法
│   ├── ui/canvas-trace.ts         # 高 DPI 雙層 Canvas 渲染 (RAF 節流)
│   ├── ui/english-keyboard.ts     # 防抖虛擬鍵盤與長按刪除模組
│   ├── i18n.ts                    # 繁中 / 英文雙語即時切換引擎
│   ├── main.ts                    # 應用程式主控制器與語音引擎調度
│   ├── style.css                  # Safe-Area 適配與深色模式自動支援
│   └── types.ts                   # 嚴格 TypeScript 資料契約
├── tests/
│   └── dictation-matcher.spec.ts  # Vitest 自動化單元測試套件
└── LICENSE                        # MIT 開放原始碼授權條款

4. 本地開發與指令說明
確保已安裝 Node.js >= 20 與 pnpm >= 8（建議 pnpm v12）：
# 安裝相依套件
pnpm install

# 啟動本地開發伺服器（支援區網 iPad 實機連線測試）
pnpm dev

# 執行 TypeScript 嚴格型別檢查
pnpm typecheck

# 執行 Vitest 單元測試
pnpm test:run

# 執行完整資料治理管線（清洗 ➔ 編譯 ➔ 轉換 ➔ 三態建置 ➔ 審計）
pnpm data:pipeline

# 構建生產環境靜態檔案
pnpm build

5. 授權條款
本專案採用 MIT License 開放原始碼授權。
🇬🇧 English Documentation
1. Overview
KidsPrepDictate is an open-source, offline-capable Progressive Web App (PWA) tailored for Hong Kong primary school students preparing for Traditional Chinese and English dictation. Built with a Pure Client-Side, Zero-Backend architecture, it delivers distraction-free, low-latency handwriting and spelling practice on iPads, smartphones, and desktops.
2. Key Features
 * 🇭🇰 Traditional Chinese Stroke & Glyph Verification
   * 1,464 HK Standard Characters: Powered by a dual-engine matcher combining sequential stroke-order validation and order-invariant spatial glyph recognition.
   * Free-Write Mode: Students can practice handwriting independently without parent setup; the engine recognizes top candidate characters and pronounces them in Cantonese (zh-HK).
   * Graceful Fallback (isFallback): Unindexed rare characters are safely handled without blocking student progress.
 * 🇬🇧 English Audio-to-Spelling Loop
   * Prioritizes en-GB / en-US Web Speech synthesis with normal speed and 0.55x Slow Listen playback.
   * Custom touch-optimized QWERTY keyboard featuring double-tap zoom prevention and hold-to-delete, plus optional hardware/system keyboard support.
   * Configurable Junior Tolerance (Levenshtein distance = 1) and progressive hint levels (First Letter / First 2 Letters / Full Word).
 * 🛡️ Privacy-by-Design & Governance-as-Code
   * Zero-Data-Retention: All custom passages, handwriting strokes, and session checkpoints reside strictly in local browser storage (localStorage). No telemetry, tracking, or server uploads.
   * Hardened Security Posture: Enforces strict Content Security Policy (CSP) and Permissions-Policy denying camera, microphone, geolocation, and sensor access.
3. Quick Start & Scripts
Requires Node.js >= 20 and pnpm >= 8:
# Install dependencies
pnpm install

# Start dev server (exposed on LAN for direct iPad touch testing)
pnpm dev

# Run strict TypeScript typechecking
pnpm typecheck

# Run automated unit tests via Vitest
pnpm test:run

# Run full data governance ETL & audit pipeline
pnpm data:pipeline

# Build production bundle
pnpm build

4. License
This project is licensed under the MIT License — see the LICENSE file for details.

