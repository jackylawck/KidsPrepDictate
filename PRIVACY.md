# 🛡️ 私隱政策聲明（家長與教育工作者指引）
# Privacy Notice (Parent & Educator Guide)

[繁體中文](#zh-privacy) ｜ [English](#en-privacy)

**生效日期 / Effective Date**：2026-11-23  
**架構原則 / Architectural Principle**：零資料收集、零伺服器上傳（Zero-Collection, Zero-Server-Upload）

---

<a id="zh-privacy"></a>
## 🇭🇰 繁體中文私隱聲明

### 1. 核心承諾：我們不收集任何資料
**童温默書（KidsPrepDictate）** 專為小學生及家庭設計，嚴格奉行「源頭零收集」的兒童私隱保護原則：
* **無需註冊或登入**：無需提供姓名、電郵地址、電話號碼、學校名稱或任何可識別個人身分的資料。
* **零伺服器傳輸**：家長輸入的默書詞語或段落、學童在螢幕上的手寫筆跡座標，均**只會在裝置本機記憶體中即時運算**，絕不會傳送至開發者或任何第三方雲端伺服器。
* **無追蹤與無廣告**：本網站不使用任何追蹤型 Cookie、廣告識別碼、行為分析工具（如 Google Analytics）或第三方數據統計腳本。

### 2. 本機儲存（`localStorage`）的用途與管理
為防止學童在溫習中途誤關網頁而遺失進度，本應用程式僅在您的裝置瀏覽器本機儲存空間（`localStorage`）寫入以下必要狀態：
* `kidsprep_session_v2`：暫存當前未完成的默書課文及已完成的字詞進度（一旦完成整段默書，系統會**自動清除**該紀錄）。
* `kidsprep_lang`：記錄介面語言偏好（繁體中文或英文）。

**如何隨時刪除資料**：家長或使用者可隨時在瀏覽器設定中選擇「清除網站資料 / 清除快取」，即可徹底移除所有本機暫存紀錄。

### 3. 裝置權限與第三方系統介面
* **硬件權限封鎖**：本應用程式透過網頁安全策略（`Permissions-Policy`）明確停用鏡頭、麥克風、地理位置及體感感測器權限。
* **語音朗讀功能（Web Speech API）**：點擊「朗讀」按鈕時，瀏覽器會呼叫您裝置作業系統（Apple iOS/iPadOS、Google Android、Microsoft Windows 等）內建的語音合成功能。該語音處理受您裝置作業系統的私隱設定約束，與本專案維護者無關。

---

<a id="en-privacy"></a>
## 🇬🇧 English Privacy Notice

### 1. Core Commitment: Zero Data Collection
**KidsPrepDictate** is built for primary school learners and families under a strict **Zero-Collection** child privacy posture:
* **No Accounts or Registration**: We do not ask for or collect names, email addresses, phone numbers, school names, or any personally identifiable information (PII).
* **Zero Server Transmission**: Custom dictation passages entered by parents and handwriting stroke coordinates drawn by students are **processed exclusively in local device memory**. Nothing is ever uploaded to the developer or any external server.
* **No Tracking or Ads**: This application contains zero tracking cookies, advertising IDs, behavioral analytics, or third-party telemetry scripts.

### 2. Local Storage (`localStorage`) Usage & Control
To prevent accidental loss of progress if a browser tab is closed mid-session, the app stores only two functional items locally on your device via browser `localStorage`:
* `kidsprep_session_v2`: Temporarily holds the active passage and completion state (automatically **deleted** once the passage is completed).
* `kidsprep_lang`: Stores the selected UI language preference (Traditional Chinese or English).

**How to Delete Local Data**: Parents or users may permanently erase all locally stored data at any time by clearing website/site data in their browser settings.

### 3. Device Permissions & OS Speech Services
* **Hardware Permissions Denied**: Browser security policies (`Permissions-Policy`) explicitly block access to the camera, microphone, geolocation, and motion sensors.
* **Speech Synthesis (`Web Speech API`)**: When audio playback is triggered, the browser invokes the native text-to-speech engine built into your device's operating system (Apple iOS/iPadOS, Google Android, Microsoft Windows, etc.), which is governed by your device's own OS privacy settings.
